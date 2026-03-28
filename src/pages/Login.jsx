import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './Auth.css';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true); // Renamed to isRegistering in diff, but keeping isLogin for consistency with existing JSX
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Added for registration
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // Added
  const [loading, setLoading] = useState(false);
  
  const { login, signup, resetPassword, loginWithGoogle } = useAuth(); // Added resetPassword, kept loginWithGoogle
  const navigate = useNavigate();

  const handleSubmit = async (e) => { // Changed to arrow function
    e.preventDefault();
    setError('');
    setMessage(''); // Added
    setLoading(true);

    if (!isLogin && password !== confirmPassword) { // Using !isLogin for registration
      setError("Las contraseñas no coinciden.");
      setLoading(false);
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
      navigate('/');
    } catch (err) {
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
      <Navbar />
      <div className="auth-container" style={{ paddingTop: '100px' }}>
        <div className={`auth-card glass ${!isLogin ? 'register-mode' : ''}`}>
          <h2 className="auth-title">
            {isLogin ? 'Identifícate' : 'Crear una cuenta'}
          </h2>
          {!isLogin && <p style={{textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem'}}>¡Únete para comprar de manera exclusiva!</p>}
          
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
              />
            </div>
            
            <div className="form-group">
              <label>Contraseña</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="input-field"
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

            <button disabled={loading} type="submit" className={`btn w-100 ${isLogin ? 'btn-primary' : 'btn-register'}`}>
              {isLogin ? 'Ingresar Seguro' : 'Registrarse Ahora'}
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

          <p className="auth-switch">
            {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
            <span onClick={() => setIsLogin(!isLogin)} className="text-accent cursor-pointer" style={{fontWeight: 'bold', textDecoration: 'underline'}}>
              {isLogin ? "¡Regístrate aquí!" : "Inicia Sesión"}
            </span>
          </p>
        </div>
      </div>
    </>
  );
};

export default Login;
