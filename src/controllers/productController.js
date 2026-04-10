const Product = require('../models/Product');

// productController.js
const getProducts = async (req, res) => {
  try {
    // 1. URL se page, limit aur search query nikalna
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12; // Ek page par 10 items
    const search = req.query.search || "";

    // 2. Search ka logic (Tumhara purana logic yahan rahega)
    const query = search ? { title: { $regex: search, $options: 'i' } } : {};

    // 3. Math for pagination
    const skip = (page - 1) * limit;

    // 4. Database se data lana (skip aur limit ke sath)
    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Naye products pehle

    // 5. Total count nikalna (Frontend ko pata hona chahiye total pages kitne hain)
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    // 6. Response bhejna
    res.status(200).json({
      products,
      currentPage: page,
      totalPages,
      totalProducts
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).populate('seller', 'name email');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { title, description, price, image, location } = req.body;

    const product = await Product.create({
      title,
      description,
      price,
      image,
      location,
      seller: req.user._id
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFilteredProducts = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const products = await Product.find(query).limit(20);

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: "Search failed", error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    product = await Product.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Product removed from marketplace',
      id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getFilteredProducts
};