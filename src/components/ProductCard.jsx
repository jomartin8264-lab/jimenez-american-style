import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import './ProductCard.css';

const ProductCard = ({ product }) => {
  const { addToCart, cartItems } = useCart();
  
  // Calcular piezas disponibles reales (Inventario total menos lo que ya tienes en el carrito)
  const itemInCart = cartItems.find(item => item.id === product.id);
  const qInCart = itemInCart ? itemInCart.quantity : 0;
  const effectiveStock = product.stock - qInCart;

  return (
    <div className="product-card">
      <div className="product-image-container">
        <img src={product.image} alt={product.name} className="product-image" />
        <div className="product-overlay">
          <button 
            onClick={() => addToCart(product)} 
            disabled={effectiveStock <= 0}
            className="btn btn-primary quick-add-btn"
          >
            <ShoppingCart size={18} /> {effectiveStock <= 0 ? 'Sin más stock' : 'Agregar'}
          </button>
        </div>
        {effectiveStock <= 0 && product.stock > 0 && (
          <div className="stock-badge" style={{ backgroundColor: 'var(--color-primary)', color: 'black' }}>En tu Carrito</div>
        )}
        {product.stock <= 0 && (
          <div className="stock-badge out-of-stock">Agotado</div>
        )}
        {effectiveStock > 0 && effectiveStock <= 2 && (
          <div className="stock-badge low-stock">¡Últimas {effectiveStock}!</div>
        )}
      </div>
      
      <div className="product-info">
        <p className="product-brand">Jiménez</p>
        <h3 className="product-title">{product.name}</h3>
        <p className="product-price">${product.price.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default ProductCard;
