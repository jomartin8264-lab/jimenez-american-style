import React, { useState } from 'react';
import { ShoppingCart, Eye } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import ProductModal from './ProductModal';
import './ProductCard.css';

const ProductCard = ({ product }) => {
  const { addToCart, cartItems } = useCart();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  
  // Calcular piezas disponibles reales (Inventario total menos lo que ya tienes en el carrito)
  const itemInCart = cartItems.find(item => item.id === product.id);
  const qInCart = itemInCart ? itemInCart.quantity : 0;
  const effectiveStock = product.stock - qInCart;

  const handleQuickAdd = (e) => {
    e.stopPropagation(); // Evita abrir el modal al agregar directo al carrito
    addToCart(product);
    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1500);
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="product-card" onClick={handleOpenModal} style={{ cursor: 'pointer' }}>
        <div className="product-image-container">
          <img src={product.image} alt={product.name} className="product-image" />
          <div className="product-overlay">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenModal();
                }}
                className="btn btn-secondary quick-view-btn"
                style={{ 
                  padding: '0.6rem 1rem', 
                  borderRadius: '4px', 
                  backgroundColor: 'rgba(255,255,255,0.2)', 
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  fontWeight: 'bold'
                }}
              >
                <Eye size={18} style={{ marginRight: '5px' }} /> Ver Detalles
              </button>
            </div>
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
          <p className="product-brand">{product.category || 'Jiménez'}</p>
          <h3 className="product-title">{product.name}</h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
            <p className="product-price">${product.price.toFixed(2)}</p>
            <span style={{ fontSize: '0.75rem', color: effectiveStock > 0 ? 'var(--color-text-light)' : '#ff3b3b' }}>
              {effectiveStock > 0 ? `${effectiveStock} disp.` : 'Agotado'}
            </span>
          </div>

          <button 
            onClick={handleQuickAdd} 
            disabled={effectiveStock <= 0 || isAdded}
            className={`btn ${isAdded ? 'btn-success' : 'btn-primary'} quick-add-btn-visible`}
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem',
              padding: '0.6rem',
              marginTop: '0.5rem',
              backgroundColor: isAdded ? '#4caf50' : '',
              color: isAdded ? 'white' : '',
              border: isAdded ? 'none' : ''
            }}
          >
            {isAdded ? (
              <>¡Agregado! ✓</>
            ) : (
              <><ShoppingCart size={18} /> {effectiveStock <= 0 ? 'Sin stock' : 'Agregar al carrito'}</>
            )}
          </button>
        </div>
      </div>

      <ProductModal 
        product={product} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
};

export default ProductCard;
