import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { X, Edit, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Modal component matching AddRecipe modal style
const Modal = ({ isOpen, onClose, message, success }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-[#1e1e2f] border border-[#3a3a50] rounded-xl p-6 w-full max-w-sm shadow-xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2
              className={`text-xl font-semibold mb-4 ${
                success ? "text-green-400" : "text-red-400"
              }`}
            >
              {success ? "Success" : "Error"}
            </h2>
            <p className="text-gray-300 mb-6">{message}</p>
            <div className="flex justify-end">
              <button
                onClick={() => onClose(success)}
                className={`px-4 py-2 rounded ${
                  success
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                } text-white transition`}
              >
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const EditRecipe = () => {
  const [formData, setFormData] = useState({
    title: "",
    ingredients: [""],
    instructions: "",
    category: "",
    photoUrl: "", // Existing Cloudinary URL or local blob URL for preview
    imageFile: null, // File object for upload
    cookingTime: "",
    initialImageUrlWasPresent: false,
  });
  const { id } = useParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, message: "", success: false });

  const navigate = useNavigate();

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (formData.photoUrl && formData.photoUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(formData.photoUrl); } catch (e) {}
      }
      setFormData((prev) => ({
        ...prev,
        imageFile: file,
        photoUrl: URL.createObjectURL(file),
      }));
    }
  };

  const handleClearImage = () => {
    if (formData.photoUrl && formData.photoUrl.startsWith("blob:")) {
      try { URL.revokeObjectURL(formData.photoUrl); } catch (e) {}
    }
    setFormData((prev) => ({
      ...prev,
      photoUrl: "",
      imageFile: null,
    }));
  };

  const handleIngredientChange = (index, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index] = value;
    handleInputChange("ingredients", newIngredients);
    if (error && newIngredients[index].trim() !== "") setError("");
  };

  const addIngredient = () => {
    const last = formData.ingredients[formData.ingredients.length - 1];
    if (last.trim() !== "") {
      setError("");
      handleInputChange("ingredients", [...formData.ingredients, ""]);
    } else {
      setError("Please fill in the last ingredient before adding a new one.");
    }
  };

  const removeIngredient = (index) => {
    if (formData.ingredients.length > 1) {
      const updated = formData.ingredients.filter((_, i) => i !== index);
      handleInputChange("ingredients", updated);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const data = new FormData();
    data.append("title", formData.title);
    data.append("instructions", formData.instructions);
    data.append("category", formData.category);
    data.append("cookingTime", formData.cookingTime ? Number(formData.cookingTime) : "");

    formData.ingredients.filter((i) => i.trim() !== "").forEach((ing) => {
      data.append("ingredients[]", ing);
    });

    if (formData.imageFile) {
      data.append("image", formData.imageFile); // <-- MUST match multer.single("image")
    } else if (!formData.photoUrl && formData.initialImageUrlWasPresent) {
      data.append("clearImage", "true");
    }

    try {
      await axios.put(`/api/recipes/${id}`, data, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setModal({ open: true, message: "Recipe updated successfully", success: true });
    } catch (err) {
      const message = err.response?.data?.message || "Recipe update failed due to a network or server error.";
      setModal({ open: true, message, success: false });
    } finally {
      setLoading(false);
    }
  };

  const closeModal = (wasSuccess) => {
    setModal({ open: false, message: "", success: false });
    if (wasSuccess) navigate("/"); // <-- FIX: Redirects to home page ("/") instead of "/manage"
  };

  useEffect(() => {
    let mounted = true;

    const fetchRecipe = async () => {
      try {
        const res = await axios.get(`/api/recipes/${id}`);
        if (!mounted) return;

        const imageUrl = res.data.image || "";

        setFormData((prev) => ({
          ...prev,
          title: res.data.title || "",
          ingredients: res.data.ingredients?.length ? res.data.ingredients : [""],
          instructions: res.data.instructions || "",
          category: res.data.category || "",
          photoUrl: imageUrl,
          imageFile: null,
          cookingTime: res.data.cookingTime || "",
          initialImageUrlWasPresent: !!imageUrl,
        }));
      } catch (err) {
        console.error("Failed to fetch recipe data:", err);
        setError("Failed to load recipe data.");
      }
    };

    fetchRecipe();

    return () => {
      mounted = false;
      if (formData.photoUrl && formData.photoUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(formData.photoUrl); } catch (e) {}
      }
    };
  }, [id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-[#1a1a2e] to-black px-4 py-10 text-gray-200 font-sans">
      <Modal
        isOpen={modal.open}
        onClose={closeModal}
        message={modal.message}
        success={modal.success}
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="bg-[#1e1e2f]/80 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-[#2a2a40]"
      >
        <div className="flex justify-center items-center gap-3 mb-8">
          <Edit className="text-5xl text-pink-500" />
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
            Edit Recipe
          </h1>
        </div>

        {error && (
          <div className="text-red-400 text-sm mb-4 bg-red-900/40 p-3 rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#2a2a40] border border-[#33334d] text-gray-100 focus:ring-2 focus:ring-pink-500"
              required
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ingredients</label>
            {formData.ingredients.map((ing, index) => (
              <div key={index} className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={ing}
                  onChange={(e) => handleIngredientChange(index, e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-[#2a2a40] border border-[#33334d] text-gray-100 focus:ring-2 focus:ring-pink-500"
                  required
                />
                {formData.ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-pink-400 hover:underline font-medium"
              onClick={addIngredient}
            >
              + Add Ingredient
            </button>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Instructions</label>
            <textarea
              value={formData.instructions}
              onChange={(e) => handleInputChange("instructions", e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#2a2a40] border border-[#33334d] text-gray-100 focus:ring-2 focus:ring-pink-500"
              rows={5}
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => handleInputChange("category", e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#2a2a40] border border-[#33334d] text-gray-100 focus:ring-2 focus:ring-pink-500"
              required
            >
              <option value="" disabled>Select Category</option>
              <option value="Breakfast">Breakfast</option>
              <option value="Lunch">Lunch</option>
              <option value="Dinner">Dinner</option>
              <option value="Dessert">Dessert</option>
              <option value="Snack">Snack</option>
              <option value="Appetizer">Appetizer</option>
            </select>
          </div>

          {/* Cooking Time */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cooking Time (minutes)</label>
            <input
              type="number"
              value={formData.cookingTime}
              onChange={(e) => handleInputChange("cookingTime", e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#2a2a40] border border-[#33334d] text-gray-100 focus:ring-2 focus:ring-pink-500"
              required
              min={0}
            />
          </div>

          {/* IMAGE UPLOAD SECTION */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Recipe Image (Upload)</label>
            <input
              type="file"
              id="imageUpload"
              name="image"  // <-- CRITICAL
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById("imageUpload").click()}
              className="flex items-center justify-center w-full mb-3 px-4 py-3 rounded-lg bg-[#3a3a50] text-gray-200 hover:bg-[#4a4a60] transition font-medium"
            >
              <Upload className="w-5 h-5 mr-2" />
              {formData.imageFile ? "Change Selected Image" : (formData.photoUrl ? "Update/Replace Image" : "Upload Image")}
            </button>

            {formData.photoUrl && (
              <div className="w-full relative">
                <img
                  src={formData.photoUrl}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg border border-[#444]"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/400x200/3a3a50/ffffff?text=Image+Not+Found";
                  }}
                />
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="absolute top-2 right-2 p-1 bg-red-600 rounded-full text-white hover:bg-red-700 transition"
                  aria-label="Remove Image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="text-center pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white py-3 rounded-lg text-lg font-semibold hover:brightness-110 transition cursor-pointer
              ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {loading ? "Updating..." : "Update Recipe"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default EditRecipe;