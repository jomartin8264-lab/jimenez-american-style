import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { db } from '../firebase';
import { doc, updateDoc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import './Admin.css';

const Admin = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // States
  const [adminList, setAdminList] = useState([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [newAdmin, setNewAdmin] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  // Categories States
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');

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
    const IMGBB_API_KEY = "fab6ce338dcb4e9eeb8ff9a89e463876"; 
    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
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
      if (imageFile) uploadedUrl = await uploadToImgBB(imageFile);

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
                    style={{ backgroundColor: 'var(--color-surface)', color: 'white' }}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Imagen</label>
                  <input type="file" onChange={(e) => setImageFile(e.target.files[0])} className="input-field" />
                </div>

                <button disabled={loading} type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                  {loading ? 'Procesando...' : (editingId ? 'Guardar Cambios' : 'Publicar')}
                </button>
              </form>
            </div>

            <div className="admin-card glass">
              <h2>Inventario</h2>
              <div className="inventory-list">
                {products.map(p => (
                  <div key={p.id} className="inventory-item">
                    <div className="inventory-info">
                      <strong>{p.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                        ${p.price} | Stock: {p.stock} | <span style={{ color: 'var(--color-secondary)' }}>{p.category}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => handleEdit(p)} className="btn btn-sm">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-sm">X</button>
                    </div>
                  </div>
                ))}
              </div>
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
                <span key={c} style={{ padding: '5px 15px', border: '1px solid #333', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {c} <b onClick={() => handleRemoveCategory(c)} style={{ color: 'red', cursor: 'pointer' }}>×</b>
                </span>
              ))}
            </div>
          </div>

          <div className="admin-card glass" style={{ marginTop: '2rem' }}>
            <h2>Empresa y Contacto</h2>
            <form onSubmit={handleSaveStoreInfo} className="admin-form">
              <textarea value={storeInfo.description} onChange={(e) => setStoreInfo({...storeInfo, description: e.target.value})} className="input-field" rows="3" />
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '10px' }}>
                <input type="text" value={storeInfo.address} onChange={(e) => setStoreInfo({...storeInfo, address: e.target.value})} className="input-field" placeholder="Dirección" title="Dirección" aria-label="Dirección" />
                <input type="text" value={storeInfo.phone} onChange={(e) => setStoreInfo({...storeInfo, phone: e.target.value})} className="input-field" placeholder="Teléfono" title="Teléfono" aria-label="Teléfono" />
              </div>
              <button disabled={savingInfo} type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>{savingInfo ? 'Guardando...' : 'Actualizar'}</button>
            </form>
          </div>

        </div>
      </div>
    </>
  );
};

export default Admin;
