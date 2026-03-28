import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Hero.css';

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-bg">
        {/* Capa de fondo difuminada para llenar espacios */}
        <video 
          src="/images/video2.mp4" 
          autoPlay loop muted playsInline
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.5)', zIndex: -2 }}
        />
        {/* Video principal, sin recortar */}
        <video 
          src="/images/video2.mp4" 
          autoPlay 
          loop 
          muted 
          playsInline
          className="hero-image"
        />
        <div className="hero-overlay"></div>
      </div>
      
      <div className="container hero-content">
        <div className="hero-text animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <img 
            src="/images/logo.png" 
            alt="Jiménez American Style" 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '220px', 
              marginBottom: '1rem',
              borderRadius: '50%',
              boxShadow: '0 0 20px rgba(184, 134, 11, 0.2)'
            }} 
          />
          <span className="hero-subtitle">NUEVA COLECCIÓN</span>
          <h1 className="hero-title">
            Define tu <br />
            <span className="text-accent">Estilo Propio</span>
          </h1>
          <p className="hero-desc">
            Descubre nuestra selección exclusiva de ropa americana. 
            Calidad premium, diseños modernos y piezas únicas para cada ocasión.
          </p>
          <div className="hero-actions">
            <Link to="/catalog" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              Comprar Ahora <ArrowRight size={18} />
            </Link>
            <Link to="/catalog" className="btn btn-secondary glass" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              Ver Catálogo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
