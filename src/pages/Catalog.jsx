import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCart } from '../contexts/CartContext';

const Catalog = () => {
  const { products } = useCart();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [categories, setCategories] = useState(['Todos', 'Dama', 'Caballero', 'Niños', 'Accesorios', 'Otros']);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const docSnap = await getDoc(doc(db, "config", "categories"));
        if (docSnap.exists()) {
          setCategories(['Todos', ...docSnap.data().list]);
        }
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };
    fetchCategories();
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (product.code && product.code.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'Todos' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '100px', paddingBottom: '5rem' }}>
        <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontSize: '2.5rem', marginBottom: '0.5rem' }}>
              Nuestro <span className="text-accent">Catálogo</span>
            </h1>
            <p style={{ color: 'var(--color-text-light)' }}>Explora las últimas tendencias de moda americana.</p>
          </div>
          
          <div style={{ position: 'relative', maxWidth: '400px', width: '100%' }}>
            <input 
              type="text" 
              placeholder="Buscar prenda o código..." 
              className="input-field"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '3rem', borderRadius: '50px' }}
            />
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
          </div>
        </header>

        {/* FILTROS DE CATEGORÍA */}
        <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '3rem', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`btn ${selectedCategory === cat ? 'btn-primary' : ''}`}
              style={{ 
                padding: '0.6rem 2rem', 
                borderRadius: '50px',
                fontSize: '0.9rem',
                backgroundColor: selectedCategory === cat ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                color: selectedCategory === cat ? 'black' : 'white',
                border: selectedCategory === cat ? 'none' : '1px solid rgba(255,255,255,0.1)',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* GRID DE PRODUCTOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2rem' }}>
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--color-text-light)' }}>
            <p style={{ fontSize: '1.2rem' }}>No encontramos prendas que coincidan con tu búsqueda.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default Catalog;
