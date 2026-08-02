import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';
import useSEO from '../hooks/useSEO';

const Home = () => {
  const { products } = useCart();
  const navigate = useNavigate();

  useSEO({
    title: 'Jiménez American Style | Ropa Americana Premium',
    description: 'Descubre nuestra selección exclusiva de ropa americana. Calidad premium, diseños modernos y piezas únicas de lookbook para cada ocasión.'
  });

  // Mostrar los primeros 4 productos en la sección "Lo Más Nuevo"
  const recentProducts = products.slice(0, 4);

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
              <p style={{ color: 'var(--color-text-light)' }}>Descubre cómo lucen y se sienten nuestras prendas exclusivas en movimiento.</p>
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

          {/* SECCIÓN DE GALERÍA DE FOTOS (Lookbook Visual) */}
          <section className="container" style={{ marginBottom: '5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <h2 style={{ fontSize: '2.5rem', fontFamily: 'Outfit', color: 'var(--color-text)', marginBottom: '0.5rem' }}>Galería <span className="text-accent">Lookbook</span></h2>
              <p style={{ color: 'var(--color-text-light)' }}>Explora la combinación y estilo de nuestras prendas.</p>
            </div>
            
            <div className="no-scrollbar" style={{ 
              display: 'flex', 
              gap: '1.5rem', 
              overflowX: 'auto', 
              paddingBottom: '1.5rem',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch'
            }}>
              {[
                { src: '/images/alina1.JPG', title: 'Estilo Casual', tag: 'Dama' },
                { src: '/images/alina2.JPG', title: 'Urban Chic', tag: 'Dama' },
                { src: '/images/alina3.JPG', title: 'Moda Americana', tag: 'Tendencia' },
                { src: '/images/alina 4.JPG', title: 'Colección Exclusiva', tag: 'Premium' },
                { src: '/images/alina5.JPG', title: 'Estilo Sofisticado', tag: 'Elegancia' },
              ].map((photo, index) => (
                <div 
                  key={index} 
                  className="glass" 
                  style={{ 
                    flex: '0 0 280px', 
                    height: '420px', 
                    borderRadius: '16px', 
                    overflow: 'hidden', 
                    position: 'relative',
                    scrollSnapAlign: 'start',
                    boxShadow: 'var(--shadow-md)',
                    transition: 'transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1), box-shadow 0.4s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-10px)';
                    e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.4)';
                    e.currentTarget.querySelector('img').style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.querySelector('img').style.transform = 'scale(1)';
                  }}
                >
                  <img 
                    src={photo.src} 
                    alt={photo.title} 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover', 
                      transition: 'transform 0.6s cubic-bezier(0.165, 0.84, 0.44, 1)' 
                    }} 
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                    padding: '1.5rem',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    height: '160px'
                  }}>
                    <span style={{ 
                      backgroundColor: 'var(--color-secondary)', 
                      color: 'black', 
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '20px', 
                      fontSize: '0.7rem', 
                      fontWeight: 'bold',
                      alignSelf: 'flex-start',
                      marginBottom: '0.5rem'
                    }}>{photo.tag}</span>
                    <h3 style={{ fontSize: '1.25rem', margin: 0, fontFamily: 'Outfit', fontWeight: '600', letterSpacing: '-0.01em' }}>{photo.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SECCIÓN DE PRODUCTOS RECIENTES */}
          <section className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontFamily: 'Outfit', color: 'var(--color-text)', marginBottom: '0.5rem' }}>Lo Más Nuevo</h2>
                <p style={{ color: 'var(--color-text-light)' }}>Explora las últimas tendencias en moda americana.</p>
              </div>
              <Link 
                to="/catalog" 
                className="btn btn-secondary" 
                style={{ cursor: 'pointer', textDecoration: 'none' }}
              >
                Ver todo
              </Link>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '2rem' }}>
              {recentProducts.map(product => (
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
