import express from "express";
import mongoose from "mongoose";
import Recipe from "../models/Recipe.js";
import User from "../models/User.js"; // 1. User model import for population
import { protect } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/optionalAuth.js"; // 2. Corrected import for optionalAuth
import multer from "multer";

import pkg from "cloudinary";
const { v2: cloudinary } = pkg;
import { CloudinaryStorage } from "multer-storage-cloudinary";

const router = express.Router();

/* =======================================================
   CLOUDINARY CONFIGURATION
========================================================== */

let upload = multer({ storage: multer.memoryStorage() }); // fallback

const CLOUDINARY_CONFIG_OK =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (CLOUDINARY_CONFIG_OK) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "Recipedia-Images",
      allowed_formats: ["jpeg", "jpg", "png"],
      transformation: [{ width: 800, height: 600, crop: "limit" }],
      public_id: () => `recipe-${Date.now()}`,
    },
  });

  upload = multer({ storage });
  console.log("Cloudinary configured successfully.");
} else {
  console.warn("⚠️ Cloudinary env variables missing. Upload/delete will NOT work.");
}


/* =======================================================
   GET ALL RECIPES (EXPLORE VIEW)
   🔥 FIX: Added .populate() to show creator username
========================================================== */
router.get("/", optionalAuth, async (req, res) => {
  const { category } = req.query;
  try {
    const query = category ? { category } : {};
    // 🚨 FIX: Populate createdBy to replace ID with username object
    const recipes = await Recipe.find(query)
      .sort({ createdAt: -1 })
      .populate("createdBy", "username"); 
    
    // Check if user is logged in to determine liked status
    const recipesWithLike = recipes.map((r) => ({
      ...r.toObject(),
      likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
      likes: r.likedBy.length,
    }));

    res.json(recipesWithLike);
  } catch(err) {
    console.error("❌ Error fetching all recipes:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   SEARCH RECIPES BY TITLE
========================================================== */
router.get("/search/query", optionalAuth, async (req, res) => {
  const { q } = req.query;
  try {
    const regex = new RegExp(q, "i");
    const recipes = await Recipe.find({ title: regex })
      .populate("createdBy", "username"); // Populate for search results too

    const recipesWithLike = recipes.map((r) => ({
      ...r.toObject(),
      likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
      likes: r.likedBy.length,
    }));

    res.json(recipesWithLike);
  } catch(err) {
    console.error("❌ Error searching recipes:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   GET LATEST RECIPES (Homepage)
   🔥 FIX: Added .populate() to show creator username
========================================================== */
router.get("/latest", optionalAuth, async (req, res) => {
  try {
    // 🚨 FIX: Populate createdBy to replace ID with username object
    const latestRecipes = await Recipe.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("createdBy", "username"); 
    
    const recipesWithLike = latestRecipes.map((r) => ({
      ...r.toObject(),
      likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
      likes: r.likedBy.length,
    }));
    
    res.json(recipesWithLike);
  } catch (err) {
    console.error("❌ Latest recipes fetch failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   GET MY RECIPES
========================================================== */
router.get("/my", protect, async (req, res) => {
  try {
    const recipes = await Recipe.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });

    res.json(recipes);
  } catch (err) {
    console.error("❌ User recipes fetch failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =======================================================
   GET USER'S LIKED RECIPES
========================================================== */
router.get("/favorites", protect, async (req, res) => {
  try {
    const { q } = req.query;
    const searchFilter = q ? { title: new RegExp(q, "i") } : {};
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const favorites = await Recipe.find({
      likedBy: userId,
      ...searchFilter,
    }).sort({ createdAt: -1 })
      .populate("createdBy", "username"); // Populate for favorites view

    res.json(favorites);
  } catch(err) {
    console.error("❌ Failed to fetch liked recipes:", err);
    res.status(500).json({ message: "Failed to fetch liked recipes" });
  }
});


/* =======================================================
   GET BY ID (Single Recipe View)
   🔥 FIX: Includes .populate() to show creator username on detail page
========================================================== */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid ID" });

    // 🚨 FIX: Populate createdBy field, retrieving only the username and email
    const recipe = await Recipe.findById(req.params.id).populate("createdBy", "username email");
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const likedByUser = req.user ? recipe.likedBy.some((id) => id.equals(req.user._id)) : false;

    res.json({
      ...recipe.toObject(),
      likedByUser,
      likes: recipe.likedBy.length,
    });
  } catch (err) {
    console.error("❌ Error fetching recipe:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   LIKE / UNLIKE A RECIPE
========================================================== */
router.post("/:id/like", protect, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const userId = req.user._id;
    const likedIndex = recipe.likedBy.findIndex((id) => id.equals(userId));

    if (likedIndex === -1) {
      recipe.likedBy.push(userId);
    } else {
      recipe.likedBy.splice(likedIndex, 1);
    }

    await recipe.save();
    res.json({ likedByUser: likedIndex === -1, likes: recipe.likedBy.length });
  } catch(err) {
    console.error("❌ Like/Unlike failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   CREATE RECIPE (multipart/form-data)
========================================================== */
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { title, description, instructions, category, cookingTime } = req.body;

    // INGREDIENT PARSING
    let ingredientsArray = [];

    if (req.body.ingredients) {
      try {
        ingredientsArray = JSON.parse(req.body.ingredients);
        if (!Array.isArray(ingredientsArray)) {
          ingredientsArray = [req.body.ingredients];
        }
      } catch {
        ingredientsArray = Array.isArray(req.body.ingredients)
          ? req.body.ingredients
          : [req.body.ingredients];
      }
    } else {
      ingredientsArray = Object.keys(req.body)
        .filter((k) => k.startsWith("ingredients["))
        .sort()
        .map((k) => req.body[k]);
    }

    if (!title || !instructions || !category || ingredientsArray.length === 0) {
      return res.status(400).json({
        message:
          "Missing required fields: title, ingredients, instructions, category",
      });
    }

    const imageUrl = req.file
      ? req.file.path || req.file.secure_url
      : null;

    const recipe = new Recipe({
      title,
      description,
      instructions,
      category,
      cookingTime,
      ingredients: ingredientsArray.filter(Boolean),
      image: imageUrl,
      createdBy: req.user._id,
    });

    await recipe.save();
    res.status(201).json(recipe);
  } catch (err) {
    console.error("❌ Recipe creation failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   UPDATE RECIPE (multipart/form-data)
========================================================== */
router.put("/:id", protect, upload.single("image"), async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const isAdmin = req.user.email === "admin@gmail.com";
    const isOwner = recipe.createdBy.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner)
      return res.status(401).json({ message: "Not authorized" });

    // Parse ingredients
    let ingredientsArray = [];
    if (req.body.ingredients) {
      ingredientsArray = Array.isArray(req.body.ingredients)
        ? req.body.ingredients
        : [req.body.ingredients];
    } else {
      ingredientsArray = Object.keys(req.body)
        .filter((k) => k.startsWith("ingredients["))
        .sort()
        .map((k) => req.body[k]);
    }

    /* -----------------------------
       IMAGE HANDLING
    ------------------------------ */
    if (req.file) {
      const newImageUrl = req.file.path || req.file.secure_url;

      if (newImageUrl) {
        // delete old image
        if (recipe.image && CLOUDINARY_CONFIG_OK) {
          const publicId = recipe.image.split("/").slice(-1)[0].split(".")[0];
          await cloudinary.uploader.destroy(publicId).catch((err) =>
            console.error("Failed deleting old image:", err)
          );
        }
        recipe.image = newImageUrl;
      }
    } else if (req.body.clearImage === "true") {
      if (recipe.image && CLOUDINARY_CONFIG_OK) {
        const publicId = recipe.image.split("/").slice(-1)[0].split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      }
      recipe.image = "";
    }

    // Update fields
    if (req.body.title) recipe.title = req.body.title;
    if (req.body.description) recipe.description = req.body.description;
    if (req.body.instructions) recipe.instructions = req.body.instructions;
    if (req.body.category) recipe.category = req.body.category;
    if (req.body.cookingTime) recipe.cookingTime = req.body.cookingTime;

    if (ingredientsArray.length > 0) {
      recipe.ingredients = ingredientsArray.filter((i) => i.trim() !== "");
    }

    await recipe.save();
    res.json({ message: "Recipe updated successfully", recipe });

  } catch (err) {
    console.error("❌ Update failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* =======================================================
   DELETE RECIPE
========================================================== */
router.delete("/:id", protect, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    const isAdmin = req.user.email === "admin@gmail.com";
    const isOwner = recipe.createdBy.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner)
      return res.status(401).json({ message: "Not authorized" });

    // delete image
    if (recipe.image && CLOUDINARY_CONFIG_OK) {
      const publicId = recipe.image.split("/").slice(-1)[0].split(".")[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await recipe.deleteOne();
    res.json({ message: "Recipe deleted" });

  } catch (err) {
    console.error("❌ Delete failed:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
// ... rest of your uncommented routes (e.g., router.get("/"), router.get("/favorites"), etc.) should follow.

// ... rest of your routes (e.g., router.get("/"), router.get("/:id"), etc.)


// import express from "express";
// import mongoose from "mongoose";
// import Recipe from "../models/Recipe.js";
// import User from "../models/User.js";
// import { protect, adminProtect, optionalAuth } from "../middleware/auth.js";

// const router = express.Router();

// // === Recipes ===

// // Get latest 3 recipes
// router.get("/latest", optionalAuth, async (req, res) => {
//   try {
//     const latestRecipes = await Recipe.find().sort({ createdAt: -1 }).limit(3);
//     const recipesWithLike = latestRecipes.map((r) => ({
//       ...r.toObject(),
//       likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
//     }));
//     res.json(recipesWithLike);
//   } catch {
//     res.status(500).json({ message: "Failed to fetch latest recipes" });
//   }
// });

// // Search recipes by title
// router.get("/search/query", optionalAuth, async (req, res) => {
//   const { q } = req.query;
//   try {
//     const regex = new RegExp(q, "i");
//     const recipes = await Recipe.find({ title: regex });
//     const recipesWithLike = recipes.map((r) => ({
//       ...r.toObject(),
//       likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
//     }));
//     res.json(recipesWithLike);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Get all recipes (with optional category filter)
// router.get("/", optionalAuth, async (req, res) => {
//   const { category } = req.query;
//   try {
//     const query = category ? { category } : {};
//     const recipes = await Recipe.find(query);
//     const recipesWithLike = recipes.map((r) => ({
//       ...r.toObject(),
//       likedByUser: req.user ? r.likedBy.some((id) => id.equals(req.user._id)) : false,
//     }));
//     res.json(recipesWithLike);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Get current user's own recipes
// router.get("/my", protect, async (req, res) => {
//   try {
//     const recipes = await Recipe.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
//     res.json(recipes);
//   } catch {
//     res.status(500).json({ message: "Failed to fetch your recipes" });
//   }
// });

// // Get user's liked recipes, optional search query
// router.get("/favorites", protect, async (req, res) => {
//   try {
//     const { q } = req.query;
//     const searchFilter = q ? { title: new RegExp(q, "i") } : {};
//     const userId = new mongoose.Types.ObjectId(req.user._id);

//     const favorites = await Recipe.find({
//       likedBy: userId,
//       ...searchFilter,
//     }).sort({ createdAt: -1 });

//     res.json(favorites);
//   } catch {
//     res.status(500).json({ message: "Failed to fetch liked recipes" });
//   }
// });

// // Create a recipe
// router.post("/", protect, async (req, res) => {
//   const { title, ingredients, instructions, category, photoUrl, cookingTime } = req.body;
//   if (!title || !ingredients || !instructions || !category || !photoUrl || !cookingTime) {
//     return res.status(400).json({ message: "Please fill all fields" });
//   }

//   try {
//     const recipe = await Recipe.create({
//       title,
//       ingredients,
//       instructions,
//       category,
//       cookingTime,
//       photoUrl,
//       createdBy: req.user._id,
//     });
//     res.status(201).json(recipe);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Update a recipe (owner or admin)
// router.put("/:id", protect, async (req, res) => {
//   try {
//     const recipe = await Recipe.findById(req.params.id);
//     if (!recipe) return res.status(404).json({ message: "Recipe not found" });

//     const isAdmin = req.user.role === "admin";
//     const isOwner = recipe.createdBy.toString() === req.user._id.toString();
//     if (!isOwner && !isAdmin) {
//       return res.status(401).json({ message: "Not authorized" });
//     }

//     const { title, ingredients, instructions, category, photoUrl, cookingTime } = req.body;

//     recipe.title = title || recipe.title;
//     recipe.ingredients = ingredients || recipe.ingredients;
//     recipe.instructions = instructions || recipe.instructions;
//     recipe.category = category || recipe.category;
//     recipe.photoUrl = photoUrl || recipe.photoUrl;
//     recipe.cookingTime = cookingTime || recipe.cookingTime;

//     const updated = await recipe.save();
//     res.json(updated);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Delete a recipe (owner or admin)
// router.delete("/:id", protect, async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
//       return res.status(400).json({ message: "Invalid recipe id" });
//     }

//     const recipe = await Recipe.findById(req.params.id);
//     if (!recipe) return res.status(404).json({ message: "Recipe not found" });

//     const isAdmin = req.user.role === "admin";
//     const isOwner = recipe.createdBy.toString() === req.user._id.toString();
//     if (!isOwner && !isAdmin) {
//       return res.status(401).json({ message: "Not authorized" });
//     }

//     await recipe.deleteOne();
//     res.json({ message: "Recipe deleted" });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Like/unlike a recipe
// router.post("/:id/like", protect, async (req, res) => {
//   try {
//     const recipe = await Recipe.findById(req.params.id);
//     if (!recipe) return res.status(404).json({ message: "Recipe not found" });

//     const userId = req.user._id;
//     const likedIndex = recipe.likedBy.findIndex((id) => id.equals(userId));

//     if (likedIndex === -1) {
//       recipe.likes = (recipe.likes || 0) + 1;
//       recipe.likedBy.push(userId);
//     } else {
//       recipe.likes = Math.max((recipe.likes || 1) - 1, 0);
//       recipe.likedBy.splice(likedIndex, 1);
//     }

//     await recipe.save();
//     res.json({ likes: recipe.likes, likedByUser: likedIndex === -1 });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Rate a recipe
// router.post("/:id/rate", protect, async (req, res) => {
//   try {
//     const { value } = req.body;
//     if (!value || value < 1 || value > 5) {
//       return res.status(400).json({ message: "Rating must be between 1 and 5" });
//     }

//     const recipe = await Recipe.findById(req.params.id);
//     if (!recipe) return res.status(404).json({ message: "Recipe not found" });

//     const userId = req.user._id.toString();
//     const existingIndex = recipe.ratings.findIndex((r) => r.user.toString() === userId);

//     if (existingIndex !== -1) {
//       recipe.ratings[existingIndex].value = value;
//     } else {
//       recipe.ratings.push({ user: userId, value });
//     }

//     const total = recipe.ratings.reduce((acc, r) => acc + r.value, 0);
//     recipe.rating = total / recipe.ratings.length;

//     await recipe.save();
//     res.json({ rating: recipe.rating, userRating: value });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Get single recipe with creator info and likedByUser
// router.get("/:id", optionalAuth, async (req, res) => {
//   try {
//     const recipe = await Recipe.findById(req.params.id).populate("createdBy", "username email");
//     if (!recipe) return res.status(404).json({ message: "Recipe not found" });

//     const likedByUser = req.user ? recipe.likedBy.some((id) => id.equals(req.user._id)) : false;

//     res.json({
//       ...recipe.toObject(),
//       likedByUser,
//     });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // === User Management (Admin only) ===

// // Get all users with optional search
// router.get("/users", adminProtect, async (req, res) => {
//   try {
//     const { q } = req.query;
//     const query = q
//       ? {
//           $or: [
//             { username: new RegExp(q, "i") },
//             { email: new RegExp(q, "i") },
//           ],
//         }
//       : {};

//     const users = await User.find(query).select("-password").sort({ createdAt: -1 });
//     res.json(users);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Get a single user by id
// router.get("/users/:id", adminProtect, async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id))
//       return res.status(400).json({ message: "Invalid user id" });

//     const user = await User.findById(req.params.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     res.json(user);
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Update user (admin only)
// router.put("/users/:id", adminProtect, async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id))
//       return res.status(400).json({ message: "Invalid user id" });

//     const { username, email, role } = req.body;
//     const validRoles = ["user", "admin"];
//     if (role && !validRoles.includes(role))
//       return res.status(400).json({ message: "Invalid role" });

//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     if (username) user.username = username;
//     if (email) user.email = email;
//     if (role) user.role = role;

//     await user.save();
//     res.json({ message: "User updated", user });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// // Delete user (admin only)
// router.delete("/users/:id", adminProtect, async (req, res) => {
//   try {
//     if (!mongoose.Types.ObjectId.isValid(req.params.id))
//       return res.status(400).json({ message: "Invalid user id" });

//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     if (user._id.toString() === req.user._id.toString())
//       return res.status(400).json({ message: "Admin cannot delete themselves" });

//     await user.deleteOne();
//     res.json({ message: "User deleted" });
//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// });

// export default router;
