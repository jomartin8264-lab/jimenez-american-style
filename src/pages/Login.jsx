import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './Auth.css';
import useSEO from '../hooks/useSEO';

const Login = () => {
  const [searchParams] = useSearchParams();
  const isPos = searchParams.get('pos') === '1' || searchParams.get('redirect') === 'pos';
  const isFresh = searchParams.get('fresh') === '1';

  useSEO({
    title: isPos ? 'Punto de Venta • Iniciar Turno - Tienda Alina' : 'Iniciar Sesión / Registro - Jiménez American Style',
    description: 'Acceso seguro al sistema de punto de venta y tienda de ropa Alina.'
  });
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { currentUser, login, signup, resetPassword, logout } = useAuth();
  const navigate = useNavigate();

  // Si se abre desde el acceso directo del POS (fresh=1), forzar cierre de sesión residual
  // para que siempre solicite credenciales al empleado o administrador que toma el equipo
  const isLoggingInRef = useRef(false);
  const initialLogoutAttemptedRef = useRef(false);
  useEffect(() => {
    if (isPos && isFresh && !initialLogoutAttemptedRef.current && !isLoggingInRef.current) {
      initialLogoutAttemptedRef.current = true;
      logout().catch(console.error);
    }
  }, [isPos, isFresh, logout]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    isLoggingInRef.current = true;
    setError('');
    setMessage('');
    setLoading(true);

    if (!isLogin && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      isLoggingInRef.current = false;
      return;
    }

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, {
          name,
          phone,
          address,
          notes
        });
      }
      // Redirigir al POS si venía en modo punto de venta, o al inicio web
      if (isPos) {
        sessionStorage.setItem('alina_pos_authenticated', '1');
        navigate('/pos');
      } else {
        navigate('/');
      }
    } catch (err) {
      isLoggingInRef.current = false;
      setError('Error al autenticar: ' + err.message);
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Por favor escribe tu correo electrónico en la casilla de arriba y vuelve a presionar este botón.");
      return;
    }

    try {
      setMessage('');
      setError('');
      setLoading(true);
      await resetPassword(email);
      setMessage("¡Listo! Te hemos enviado un correo seguro para restablecer tu contraseña. Revisa tu bandeja de entrada o carpeta de SPAM.");
    } catch (err) {
      setError("Error al restablecer contraseña. Verifica que el correo esté bien escrito e intenta de nuevo.");
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <>
      {!isPos && <Navbar />}
      <div className="auth-container" style={{ paddingTop: isPos ? '40px' : '100px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className={`auth-card glass ${!isLogin ? 'register-mode' : ''}`} style={{ maxWidth: '440px', width: '100%', border: isPos ? '1px solid rgba(16, 185, 129, 0.3)' : undefined }}>
          {isPos && (
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '2.5rem' }}>🏪</span>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: '0.4rem 0 0.2rem 0' }}>
                PUNTO DE VENTA • ALINA
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                Control de Turnos y Mostrador
              </p>
            </div>
          )}
          <h2 className="auth-title" style={{ fontSize: isPos ? '1.15rem' : undefined, marginTop: isPos ? '0.5rem' : undefined }}>
            {isPos 
              ? 'Acceso de Cajero / Empleado' 
              : (isLogin ? 'Identifícate' : 'Crear una cuenta')}
          </h2>
          {isPos && (
            <p style={{ textAlign: 'center', marginBottom: '1.2rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
              Ingresa con tu correo y contraseña para tomar el equipo y abrir tu turno.
            </p>
          )}
          {!isPos && !isLogin && <p style={{textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem'}}>¡Únete para comprar de manera exclusiva!</p>}
          
          {error && <div className="alert alert-error" style={{ color: '#ff4d4d', marginBottom: '1rem', backgroundColor: 'rgba(255, 77, 77, 0.1)', padding: '10px', borderRadius: '4px' }}>{error}</div>}
          {message && <div className="alert alert-success" style={{ color: '#4caf50', marginBottom: '1rem', backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: '10px', borderRadius: '4px' }}>{message}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {!isLogin && (
              <>
                <div className="form-group">
                  <label>Nombre Completo *</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
                </div>
                <div className="form-group">
                  <label>Teléfono (WhatsApp o Llamadas) *</label>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" placeholder="10 dígitos" />
                </div>
                <div className="form-group">
                  <label>Domicilio de Entrega *</label>
                  <textarea required value={address} onChange={(e) => setAddress(e.target.value)} className="input-field" rows="2" placeholder="Calle, Número, Colonia, Ciudad"></textarea>
                </div>
                <div className="form-group">
                  <label>Observaciones o Preferencia de Horario</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" rows="2" placeholder="Ej: Entregar después de las 4 PM"></textarea>
                </div>
              </>
            )}

            <div className="form-group">
              <label>Correo Electrónico *</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="input-field"
                placeholder="ejemplo@correo.com"
                autoFocus
              />
            </div>
            
            <div className="form-group">
              <label>Contraseña *</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            {!isLogin && (
              <div className="form-group">
                <label>Confirmar Contraseña</label>
                <input 
                  type="password" 
                  required 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  className="input-field"
                />
              </div>
            )}

            <button 
              disabled={loading} 
              type="submit" 
              className={`btn w-100 ${isLogin ? 'btn-primary' : 'btn-register'}`}
              style={{
                background: isPos ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : undefined,
                fontWeight: 700,
                fontSize: '1rem',
                padding: '0.85rem'
              }}
            >
              {loading 
                ? 'Verificando...' 
                : (isPos ? '🚀 Entrar al Punto de Venta' : (isLogin ? 'Ingresar Seguro' : 'Registrarse Ahora'))}
            </button>
          </form>

          {isLogin && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button 
                onClick={handleResetPassword} 
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {!isPos && (
            <p className="auth-switch">
              {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
              <span onClick={() => setIsLogin(!isLogin)} className="text-accent cursor-pointer" style={{fontWeight: 'bold', textDecoration: 'underline'}}>
                {isLogin ? "¡Regístrate aquí!" : "Inicia Sesión"}
              </span>
            </p>
          )}

          {isPos && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
              <a 
                href="/" 
                target="_blank" 
                rel="noreferrer"
                style={{ color: '#94a3b8', fontSize: '0.8rem', textDecoration: 'none' }}
              >
                🌐 Abrir Tienda Web de Clientes
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Login;
