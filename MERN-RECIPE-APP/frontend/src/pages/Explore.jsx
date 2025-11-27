import axios from "axios";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useContext,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass } from "lucide-react";
import RecipeCard from "../components/RecipeCard";
import { toggleFavorite } from "../utils/toggleFavorite";
import { AuthContext } from "../context/AuthContext";
import LoginPromptModal from "../components/LoginPromptModal";

// Confirmation modal component matching your app style
const ConfirmDeleteModal = ({ recipe, onConfirm, onCancel }) => {
  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-[#1e1e2f] rounded-lg p-6 max-w-sm mx-auto text-center shadow-lg border border-[#2a2a40]"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h2 className="text-xl font-semibold mb-4 text-pink-400">
          Confirm Delete
        </h2>
        <p className="mb-6 text-gray-300">
          Are you sure you want to delete{" "}
          <span className="font-semibold">{recipe.title}</span>?
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-full bg-gray-700 hover:bg-gray-600 transition text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-full bg-pink-500 hover:bg-pink-600 transition text-white"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const categories = [
  "All",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Snack",
  "Appetizer",
];

const Explore = () => {
  const { user } = useContext(AuthContext);
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const [likesState, setLikesState] = useState({});
  const pendingToggles = useRef(new Set());

  // New state for delete confirmation modal
  const [recipeToDelete, setRecipeToDelete] = useState(null);

  const updateLikesStateFromData = (data) => {
    setLikesState((prev) => {
      const updated = { ...prev };
      data.forEach((r) => {
        if (!pendingToggles.current.has(r._id)) {
          updated[r._id] = {
            liked: r.likedByUser ?? false,
            likesCount: r.likes ?? 0,
          };
        }
      });
      return updated;
    });
  };

  const sortByLatest = (data) => {
    return [...data].sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return b._id.localeCompare(a._id);
    });
  };

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // FIX: Correctly append the query string to the base URL
      const endpoint = `/api/recipes${
        category && category !== "All" ? `?category=${category}` : ""
      }`;

      const res = await axios.get(endpoint);
      
      const data = sortByLatest(res.data);
      setRecipes(data);
      setFilteredRecipes(null);
      updateLikesStateFromData(data);
    } catch {
      setError("Failed to fetch recipes. Please try again.");
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredRecipes(null);
      setError(null);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/recipes/search/query?q=${search}`);
        const data = sortByLatest(res.data);
        setFilteredRecipes(data);
        updateLikesStateFromData(data);
      } catch {
        setError("Failed to search recipes.");
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  const handleClearSearch = () => {
    setSearch("");
    setFilteredRecipes(null);
    setError(null);
  };

  const handleHeartClick = async (recipeId) => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    if (pendingToggles.current.has(recipeId)) return;

    const prevLiked = likesState[recipeId]?.liked ?? false;
    const prevCount = likesState[recipeId]?.likesCount ?? 0;

    setLikesState((prev) => ({
      ...prev,
      [recipeId]: {
        liked: !prevLiked,
        likesCount: prevCount + (prevLiked ? -1 : 1),
      },
    }));

    pendingToggles.current.add(recipeId);

    try {
      await toggleFavorite(recipeId);
      const res = await axios.get(`/api/recipes/${recipeId}`);
      const updatedRecipe = res.data;

      setLikesState((prev) => ({
        ...prev,
        [recipeId]: {
          liked: updatedRecipe.likedByUser ?? false,
          likesCount: updatedRecipe.likes ?? 0,
        },
      }));
    } catch (error) {
      setLikesState((prev) => ({
        ...prev,
        [recipeId]: {
          liked: prevLiked,
          likesCount: prevCount,
        },
      }));
    } finally {
      pendingToggles.current.delete(recipeId);
    }
  };

  const handleFavoriteUpdate = useCallback(async () => {
    if (search.trim()) {
      try {
        setLoading(true);
        const res = await axios.get(`/api/recipes/search/query?q=${search}`);
        const data = sortByLatest(res.data);
        setFilteredRecipes(data);
        updateLikesStateFromData(data);
      } catch {
        setError("Failed to refresh search results.");
      }
      setLoading(false);
    } else {
      fetchRecipes();
    }
  }, [search, fetchRecipes]);

  useEffect(() => {
    window.addEventListener("favorite-updated", handleFavoriteUpdate);
    return () => {
      window.removeEventListener("favorite-updated", handleFavoriteUpdate);
    };
  }, [handleFavoriteUpdate]);

  const displayedRecipes = useMemo(() => filteredRecipes || recipes, [
    filteredRecipes,
    recipes,
  ]);

  // New handlers for delete confirmation modal
  const handleDeleteClick = (recipe) => {
    if (user?.email === "admin@gmail.com") {
      setRecipeToDelete(recipe);
    }
  };

  const confirmDelete = async () => {
    if (!recipeToDelete) return;
    try {
      await axios.delete(`/api/recipes/${recipeToDelete._id}`);
      setRecipeToDelete(null);
      fetchRecipes();
    } catch (error) {
      console.error("Delete failed:", error);
      setRecipeToDelete(null);
    }
  };

  const cancelDelete = () => {
    setRecipeToDelete(null);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen px-4 py-10 bg-gradient-to-br from-gray-900 via-[#1a1a2e] to-black text-gray-200">
      <motion.div
        className="flex justify-center items-center mb-6 gap-3"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <Compass size={48} stroke="#ec4899" className="animate-spin-slow" />
        <h1
          className="text-5xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 font-bold tracking-tight text-center"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Explore Recipes
        </h1>
      </motion.div>

      <motion.form
        className="w-full max-w-xl mx-auto flex gap-2 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-5 py-3 rounded-full bg-[#1e1e2f] border border-[#2a2a40] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 text-lg"
          aria-label="Search recipes"
        />
        {search && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="px-4 py-2 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 transition cursor-pointer"
            aria-label="Clear search input"
          >
            Clear
          </button>
        )}
      </motion.form>

      <motion.div
        className="flex flex-wrap justify-center gap-3 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {categories.map((cat) => {
          const isActive = category === cat;

          return (
            <motion.div
              key={cat}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              className={`rounded-full transition ${
                !isActive
                  ? "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 p-[2px]"
                  : ""
              }`}
            >
              <button
                onClick={() => setCategory(cat)}
                aria-pressed={isActive}
                className={`px-5 py-2 text-sm font-semibold rounded-full w-full h-full cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                  isActive
                    ? "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white shadow-md"
                    : "bg-gradient-to-br from-gray-900 via-[#1a1a2e] to-black text-gray-200 hover:from-[#23233a] hover:via-[#2a2a44] hover:to-[#1a1a2e]"
                }`}
              >
                {cat}
              </button>
            </motion.div>
          );
        })}
      </motion.div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="bg-[#1e1e2f] border border-[#2a2a40] shadow rounded-2xl p-4 animate-pulse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="h-48 bg-[#2a2a40] mb-4 rounded"></div>
              <div className="h-4 bg-[#33334d] rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-[#33334d] rounded w-1/2"></div>
            </motion.div>
          ))}
        </div>
      )}

      {error && (
        <motion.p
          className="text-center text-red-400 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.p>
      )}

      <AnimatePresence mode="wait">
        {!loading && !error && (
          <motion.div
            key={category + (filteredRecipes ? "-search" : "-all")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-7xl min-h-[500px]"
          >
            {displayedRecipes.length === 0 ? (
              <motion.p
                className="text-center text-gray-400 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                No recipes found.
              </motion.p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe._id}
                    recipe={recipe}
                    liked={likesState[recipe._id]?.liked ?? false}
                    likesCount={likesState[recipe._id]?.likesCount ?? 0}
                    isLatestOrExplore={true}
                    onHeartClick={() => handleHeartClick(recipe._id)}
                    processing={pendingToggles.current.has(recipe._id)}
                    user={user} // Pass user for admin check
                    onDelete={() => handleDeleteClick(recipe)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLoginPrompt && (
          <LoginPromptModal onClose={() => setShowLoginPrompt(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recipeToDelete && (
          <ConfirmDeleteModal
            recipe={recipeToDelete}
            onConfirm={confirmDelete}
            onCancel={cancelDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Explore;