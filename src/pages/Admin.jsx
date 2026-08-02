import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { db } from '../firebase';
import { doc, updateDoc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import './Admin.css';
import useSEO from '../hooks/useSEO';

const Admin = () => {
  useSEO({
    title: 'Panel de Administración - Jiménez American Style',
    description: 'Panel exclusivo para el administrador. Gestiona el catálogo de productos, existencias, configuraciones de API y accesos.'
  });
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // States
  const [adminList, setAdminList] = useState([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [newAdmin, setNewAdmin] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Categories States
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');

  // API settings state (Telegram + ImgBB)
  const [apiSettings, setApiSettings] = useState({
    telegramToken: '8521379806:AAEWEBEGbKFp7_lRozQKzLGRC1TjUuRRbqU',
    telegramChatId: '8420282387',
    imgbbApiKey: 'fab6ce338dcb4e9eeb8ff9a89e463876'
  });

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '', price: '', stock: '', code: '', image: '', category: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '', price: '', stock: '', code: '', image: '', category: ''
  });

  // Store Info states
  const [storeInfo, setStoreInfo] = useState({
    description: '',
    address: '',
    phone: '',
    facebook: '',
    instagram: ''
  });

  // Auth and Data Fetching
  useEffect(() => {
    const checkAccess = async () => {
      if (!currentUser) {
        navigate('/');
        return;
      }
      
      try {
        const docSnap = await getDoc(doc(db, "config", "admins"));
        let emails = ['jomartin8264@gmail.com'];
        if (docSnap.exists() && docSnap.data().emails) {
          emails = docSnap.data().emails;
        } else {
          await setDoc(doc(db, "config", "admins"), { emails });
        }
        
        setAdminList(emails);
        
        if (!emails.includes(currentUser.email)) {
          alert("Acceso denegado: Solo nuestro personal autorizado puede entrar aquí.");
          navigate('/');
        } else {
          fetchProducts();
          fetchStoreInfo();
          fetchCategories();
          fetchApiSettings();
          setCheckingAccess(false);
        }
      } catch (err) {
        console.error(err);
        navigate('/');
      }
    };
    checkAccess();
  }, [currentUser, navigate]);

  const fetchProducts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "products"));
      const items = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      // Sort by newest first (assuming createdAt exists, otherwise just reverse)
      items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setProducts(items);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchStoreInfo = async () => {
    try {
      const docSnap = await getDoc(doc(db, "config", "storeInfo"));
      if (docSnap.exists()) {
        setStoreInfo(docSnap.data());
      }
    } catch (error) {
      console.error("Error fetching store info:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const docSnap = await getDoc(doc(db, "config", "categories"));
      if (docSnap.exists()) {
        const list = docSnap.data().list || [];
        setCategories(list);
        if (list.length > 0) {
          setNewProduct(prev => ({ ...prev, category: list[0] }));
        }
      } else {
        const initial = ['Dama', 'Caballero', 'Niños', 'Accesorios', 'Otros'];
        await setDoc(doc(db, "config", "categories"), { list: initial });
        setCategories(initial);
        setNewProduct(prev => ({ ...prev, category: initial[0] }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchApiSettings = async () => {
    try {
      const docSnap = await getDoc(doc(db, "config", "apiSettings"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setApiSettings({
          telegramToken: data.telegramToken || '8521379806:AAEWEBEGbKFp7_lRozQKzLGRC1TjUuRRbqU',
          telegramChatId: data.telegramChatId || '8420282387',
          imgbbApiKey: data.imgbbApiKey || 'fab6ce338dcb4e9eeb8ff9a89e463876'
        });
      }
    } catch (error) {
      console.error("Error fetching API settings:", error);
    }
  };

  // Actions
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const updated = [...categories, newCatName.trim()];
    try {
      await setDoc(doc(db, "config", "categories"), { list: updated });
      setCategories(updated);
      setNewCatName('');
    } catch (err) {
      alert("Error al guardar categoría");
    }
  };

  const handleRemoveCategory = async (cat) => {
    if (categories.length <= 1) return alert("Debes tener al menos una.");
    if (!window.confirm(`¿Eliminar "${cat}"?`)) return;
    const updated = categories.filter(c => c !== cat);
    await setDoc(doc(db, "config", "categories"), { list: updated });
    setCategories(updated);
  };

  const uploadToImgBB = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const key = apiSettings.imgbbApiKey || "fab6ce338dcb4e9eeb8ff9a89e463876"; 
    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      return data.success ? data.data.url : null;
    } catch (err) {
      return null;
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let uploadedUrl = null;
      if (imageFile) {
        uploadedUrl = await uploadToImgBB(imageFile);
        if (!uploadedUrl) {
          alert("Error al subir la imagen a ImgBB. Verifica tu API Key.");
          setLoading(false);
          return;
        }
      }

      if (editingId) {
        const updateData = { ...editForm, price: Number(editForm.price), stock: Number(editForm.stock) };
        if (uploadedUrl) updateData.image = uploadedUrl;
        await updateDoc(doc(db, "products", editingId), updateData);
        alert("¡Actualizado!");
        setEditingId(null);
      } else {
        if (!uploadedUrl) {
          alert("Sube una imagen.");
          setLoading(false);
          return;
        }
        await addDoc(collection(db, "products"), {
          ...newProduct,
          image: uploadedUrl,
          price: Number(newProduct.price),
          stock: Number(newProduct.stock),
          createdAt: new Date().toISOString()
        });
        alert("¡Publicado!");
      }
      clearForm();
      fetchProducts();
    } catch (error) {
      alert("Error al guardar");
    }
    setLoading(false);
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      price: product.price,
      stock: product.stock,
      code: product.code || '',
      image: product.image,
      category: product.category || categories[0]
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Eliminar prenda?")) {
      await deleteDoc(doc(db, "products", id));
      fetchProducts();
    }
  };

  const clearForm = () => {
    setNewProduct({ name: '', price: '', stock: '', code: '', image: '', category: categories[0] || '' });
    setEditingId(null);
    setImageFile(null);
  };

  const handleSaveStoreInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    await setDoc(doc(db, "config", "storeInfo"), storeInfo, { merge: true });
    alert("Contacto actualizado");
    setSavingInfo(false);
  };

  const handleSaveApiSettings = async (e) => {
    e.preventDefault();
    setSavingApi(true);
    try {
      await setDoc(doc(db, "config", "apiSettings"), apiSettings, { merge: true });
      alert("Configuración de APIs y Telegram actualizada correctamente.");
    } catch (err) {
      alert("Error al guardar la configuración de APIs.");
      console.error(err);
    }
    setSavingApi(false);
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    const email = newAdmin.trim().toLowerCase();
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) return alert("Usuario no encontrado.");
    
    const updated = [...adminList, email];
    await setDoc(doc(db, "config", "admins"), { emails: updated });
    setAdminList(updated);
    setNewAdmin('');
  };

  const handleRemoveAdmin = async (email) => {
    if (email === 'jomartin8264@gmail.com') return;
    const updated = adminList.filter(e => e !== email);
    await setDoc(doc(db, "config", "admins"), { emails: updated });
    setAdminList(updated);
  };

  if (checkingAccess) return <div style={{ paddingTop: '150px', textAlign: 'center' }}><p>Verificando...</p></div>;

  return (
    <>
      <Navbar />
      <div className="admin-container" style={{ paddingTop: '100px', paddingBottom: '50px' }}>
        <div className="container">
          <h1 style={{ color: 'var(--color-primary)', marginBottom: '2rem' }}>Panel de Administración</h1>
          
          <div className="admin-grid">
            <div className="admin-card glass">
              <h2>{editingId ? 'Editar Prenda' : 'Añadir Prenda'}</h2>
              <form onSubmit={handleAddProduct} className="admin-form">
                <div className="form-group">
                  <label>Nombre</label>
                  <input type="text" value={editingId ? editForm.name : newProduct.name} onChange={(e) => editingId ? setEditForm({...editForm, name: e.target.value}) : setNewProduct({...newProduct, name: e.target.value})} required className="input-field" />
                </div>
                
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Precio ($)</label>
                    <input type="number" step="0.01" value={editingId ? editForm.price : newProduct.price} onChange={(e) => editingId ? setEditForm({...editForm, price: e.target.value}) : setNewProduct({...newProduct, price: e.target.value})} required className="input-field" />
                  </div>
                  <div className="form-group">
                    <label>Stock</label>
                    <input type="number" value={editingId ? editForm.stock : newProduct.stock} onChange={(e) => editingId ? setEditForm({...editForm, stock: e.target.value}) : setNewProduct({...newProduct, stock: e.target.value})} required className="input-field" />
                  </div>
                </div>

                <div className="form-group">
                  <label>SKU</label>
                  <input type="text" value={editingId ? editForm.code : newProduct.code} onChange={(e) => editingId ? setEditForm({...editForm, code: e.target.value}) : setNewProduct({...newProduct, code: e.target.value})} className="input-field" />
                </div>

                <div className="form-group">
                  <label>Categoría</label>
                  <select 
                    value={editingId ? editForm.category : newProduct.category}
                    onChange={(e) => editingId ? setEditForm({...editForm, category: e.target.value}) : setNewProduct({...newProduct, category: e.target.value})}
                    className="input-field"
                    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Imagen</label>
                  <input type="file" onChange={(e) => setImageFile(e.target.files[0])} className="input-field" />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                  <button disabled={loading} type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {loading ? 'Procesando...' : (editingId ? 'Guardar Cambios' : 'Publicar')}
                  </button>
                  {editingId && (
                    <button 
                      type="button" 
                      onClick={clearForm} 
                      className="btn" 
                      style={{ flex: 1, backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="admin-card glass">
              <h2>Inventario</h2>
              <div className="inventory-list">
                {products.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(p => (
                  <div key={p.id} className="inventory-item" style={{ display: 'flex', alignItems: 'center' }}>
                    {p.image && (
                      <img src={p.image} alt={p.name} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    )}
                    <div className="inventory-info" style={{ flex: 1, marginLeft: '15px' }}>
                      <strong>{p.name}</strong> <span style={{ fontSize: '0.75rem', color: '#888', userSelect: 'all' }}>(ID: {p.id})</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                        ${p.price} | Stock: {p.stock} | SKU: {p.code || 'N/A'} | <span style={{ color: 'var(--color-secondary)' }}>{p.category}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => handleEdit(p)} className="btn btn-sm">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-sm">X</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Controles de paginación */}
              {products.length > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '1.5rem', alignItems: 'center' }}>
                  <button 
                    disabled={currentPage === 1} 
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="btn btn-sm"
                  >
                    Anterior
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
                    Página {currentPage} de {Math.ceil(products.length / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage === Math.ceil(products.length / itemsPerPage)} 
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="btn btn-sm"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="admin-card glass" style={{ marginTop: '2rem' }}>
            <h2>🏷️ Categorías Dinámicas</h2>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
              <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="input-field" placeholder="Nueva..." />
              <button type="submit" className="btn btn-primary">Añadir</button>
            </form>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {categories.map(c => (
                <span key={c} style={{ padding: '5px 15px', border: '1px solid var(--color-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {c} <b onClick={() => handleRemoveCategory(c)} style={{ color: 'red', cursor: 'pointer' }}>×</b>
                </span>
              ))}
            </div>
          </div>

          <div className="admin-card glass" style={{ marginTop: '2rem' }}>
            <h2>Empresa y Contacto</h2>
            <form onSubmit={handleSaveStoreInfo} className="admin-form">
              <div className="form-group">
                <label>Descripción de Nosotros</label>
                <textarea value={storeInfo.description} onChange={(e) => setStoreInfo({...storeInfo, description: e.target.value})} className="input-field" rows="3" />
              </div>
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '10px' }}>
                <div className="form-group">
                  <label>Dirección</label>
                  <input type="text" value={storeInfo.address} onChange={(e) => setStoreInfo({...storeInfo, address: e.target.value})} className="input-field" placeholder="Dirección" />
                </div>
                <div className="form-group">
                  <label>Teléfono (WhatsApp)</label>
                  <input type="text" value={storeInfo.phone} onChange={(e) => setStoreInfo({...storeInfo, phone: e.target.value})} className="input-field" placeholder="Teléfono" />
                </div>
              </div>
              <button disabled={savingInfo} type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>{savingInfo ? 'Guardando...' : 'Actualizar'}</button>
            </form>
          </div>

          <div className="admin-card glass" style={{ marginTop: '2rem' }}>
            <h2>🔧 Configuración del Sistema (APIs y Canales)</h2>
            <form onSubmit={handleSaveApiSettings} className="admin-form">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Telegram Bot Token</label>
                <input 
                  type="text" 
                  value={apiSettings.telegramToken} 
                  onChange={(e) => setApiSettings({...apiSettings, telegramToken: e.target.value})} 
                  className="input-field" 
                  placeholder="Bot Token"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Telegram Chat ID</label>
                <input 
                  type="text" 
                  value={apiSettings.telegramChatId} 
                  onChange={(e) => setApiSettings({...apiSettings, telegramChatId: e.target.value})} 
                  className="input-field" 
                  placeholder="Chat ID"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>ImgBB API Key (Subida de Imágenes)</label>
                <input 
                  type="text" 
                  value={apiSettings.imgbbApiKey} 
                  onChange={(e) => setApiSettings({...apiSettings, imgbbApiKey: e.target.value})} 
                  className="input-field" 
                  placeholder="API Key de ImgBB"
                />
              </div>
              <button disabled={savingApi} type="submit" className="btn btn-primary">
                {savingApi ? 'Guardando...' : 'Actualizar Llaves'}
              </button>
            </form>
          </div>

          <div className="admin-card glass" style={{ marginTop: '2rem' }}>
            <h2>Admins Autorizados</h2>
            <form onSubmit={handleAddAdmin} style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
              <input type="email" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} className="input-field" placeholder="Correo electrónico del nuevo administrador" />
              <button type="submit" className="btn btn-primary">Añadir</button>
            </form>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {adminList.map(email => (
                <span key={email} style={{ padding: '5px 15px', border: '1px solid var(--color-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {email} 
                  {email !== 'jomartin8264@gmail.com' && (
                    <b onClick={() => handleRemoveAdmin(email)} style={{ color: 'red', cursor: 'pointer' }}>×</b>
                  )}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Admin;
