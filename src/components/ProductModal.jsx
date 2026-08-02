import React from 'react';
import { X, ShoppingCart, Info, Tag, Layers } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import './ProductModal.css';

const ProductModal = ({ product, isOpen, onClose }) => {
  const { addToCart, cartItems } = useCart();

  if (!isOpen || !product) return null;

  // Calcular inventario efectivo
  const itemInCart = cartItems.find(item => item.id === product.id);
  const qInCart = itemInCart ? itemInCart.quantity : 0;
  const effectiveStock = product.stock - qInCart;

  const handleOverlayClick = (e) => {
    if (e.target.className === 'modal-overlay') {
      onClose();
    }
  };

  const handleAddToCart = () => {
    addToCart(product);
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content glass animate-fade-in">
        <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
          <X size={24} />
        </button>

        <div className="modal-body">
          <div className="modal-image-wrapper">
            <img src={product.image} alt={product.name} className="modal-image" />
            {product.stock <= 0 && <span className="modal-badge out-of-stock">Agotado</span>}
            {effectiveStock <= 0 && product.stock > 0 && <span className="modal-badge in-cart">En tu Carrito</span>}
          </div>

          <div className="modal-details">
            <div className="modal-header">
              <span className="modal-brand">Jiménez American Style</span>
              <h2 className="modal-title">{product.name}</h2>
              <p className="modal-price">${product.price.toFixed(2)}</p>
            </div>

            <div className="modal-meta-grid">
              <div className="meta-item">
                <Tag size={16} className="meta-icon" />
                <div>
                  <span className="meta-label">Categoría</span>
                  <span className="meta-value">{product.category || 'Sin categoría'}</span>
                </div>
              </div>

              <div className="meta-item">
                <Layers size={16} className="meta-icon" />
                <div>
                  <span className="meta-label">SKU / Código</span>
                  <span className="meta-value">{product.code || 'N/A'}</span>
                </div>
              </div>

              <div className="meta-item">
                <Info size={16} className="meta-icon" />
                <div>
                  <span className="meta-label">Disponibilidad</span>
                  <span className={`meta-value ${product.stock <= 0 ? 'text-danger' : 'text-success'}`}>
                    {product.stock <= 0 
                      ? 'Agotado' 
                      : `${product.stock} unidades en almacén (${effectiveStock} disponibles)`
                    }
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-description">
              <h3>Descripción</h3>
              <p>
                Prenda americana de calidad premium, seleccionada y sanitizada cuidadosamente. 
                Nuestras piezas son de edición limitada para asegurar la exclusividad de tu estilo.
              </p>
            </div>

            <div className="modal-actions">
              <button 
                onClick={handleAddToCart} 
                disabled={effectiveStock <= 0}
                className="btn btn-primary modal-buy-btn"
              >
                <ShoppingCart size={20} />
                {effectiveStock <= 0 ? 'Sin stock disponible' : 'Agregar al Carrito'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
