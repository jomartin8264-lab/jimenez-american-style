import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';

const Home = () => {
  const { products } = useCart();
  const navigate = useNavigate();

  return (
    <>
      <Navbar />
      <div className="home-page">
        <Hero />
        
        <main style={{ padding: '4rem 0' }}>
          
          {/* SECCIÓN DE GALERÍA DE VIDEOS (Lookbook) */}
          <section className="container" style={{ marginBottom: '5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <h2 style={{ fontSize: '2.5rem', fontFamily: 'Outfit', color: 'var(--color-text)', marginBottom: '0.5rem' }}>Nuestro <span className="text-accent">Estilo en Movimiento</span></h2>
              <p style={{ color: 'var(--color-text-light)' }}>Descubre cómo lucen y se sienten nuestras prendas exclusivas.</p>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              {/* Video 3 */}
              <div className="glass" style={{ position: 'relative', height: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                {/* Fondo difuminado cinematográfico */}
                <video src="/images/video3.mp4" autoPlay loop muted playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.4)', zIndex: -1 }} />
                {/* Video Real sin recortes */}
                <video src="/images/video3.mp4" autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', zIndex: 1, position: 'relative' }} />
              </div>
              
              {/* Video 4 */}
              <div className="glass" style={{ position: 'relative', height: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                {/* Fondo difuminado cinematográfico */}
                <video src="/images/video4.mp4" autoPlay loop muted playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.4)', zIndex: -1 }} />
                {/* Video Real sin recortes */}
                <video src="/images/video4.mp4" autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', zIndex: 1, position: 'relative' }} />
              </div>
            </div>
          </section>

          {/* SECCIÓN DE PRODUCTOS RECIENTES */}
          <section className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontFamily: 'Outfit', color: 'var(--color-text)', marginBottom: '0.5rem' }}>Lo Más Nuevo</h2>
                <p style={{ color: 'var(--color-text-light)' }}>Explora las últimas tendencias en moda americana.</p>
              </div>
              <a 
                href="/catalog" 
                className="btn btn-secondary" 
                style={{ cursor: 'pointer', textDecoration: 'none' }}
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = '/catalog';
                }}
              >
                Ver todo
              </a>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '2rem' }}>
              {products.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </>
  );
};

export default Home;
