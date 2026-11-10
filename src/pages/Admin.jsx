import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { db } from '../firebase';
import { doc, updateDoc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import './Admin.css';
import useSEO from '../hooks/useSEO';
import BarcodeModal from '../components/BarcodeModal';
import BatchBarcodeModal from '../components/BatchBarcodeModal';
import QuickProductEntryModal from '../components/QuickProductEntryModal';
import { getProductImage, compressImageToBase64 } from '../utils/productImages';

const Admin = () => {
  useSEO({
    title: 'Panel de Administración - Jiménez American Style',
    description: 'Panel exclusivo para el administrador. Gestiona el catálogo de productos, existencias, configuraciones de API y accesos.'
  });
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // States
  const [adminList, setAdminList] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('employee');
  const [newAdmin, setNewAdmin] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showQuickEntryModal, setShowQuickEntryModal] = useState(false);

  // Estado para promover prendas "Solo Tienda" a Web
  const [promotingProduct, setPromotingProduct] = useState(null);
  const [promoteImageFile, setPromoteImageFile] = useState(null);
  const [isPromoting, setIsPromoting] = useState(false);

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

  const generateAutoSKU = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    const datePart = Date.now().toString().slice(-4);
    return `ALN-${datePart}${random}`;
  };

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '', price: '', stock: '1', code: '', size: 'M', image: '', category: '', description: '', availableOnline: false
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '', price: '', stock: '', code: '', size: 'M', image: '', category: '', description: '', availableOnline: true
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
        navigate('/login');
        return;
      }
      
      try {
        const currentEmail = currentUser.email?.toLowerCase();

        // 1. Cargar lista de administradores tradicionales
        const docSnap = await getDoc(doc(db, "config", "admins"));
        let emails = ['jomartin8264@gmail.com'];
        if (docSnap.exists() && docSnap.data().emails) {
          emails = docSnap.data().emails;
        } else {
          await setDoc(doc(db, "config", "admins"), { emails });
        }
        setAdminList(emails);

        // 2. Cargar lista de personal (staff)
        const staffSnap = await getDoc(doc(db, "config", "staff"));
        let sList = [];
        if (staffSnap.exists() && staffSnap.data().users) {
          sList = staffSnap.data().users;
        } else {
          sList = emails.map(email => ({
            email: email.toLowerCase(),
            name: email.toLowerCase() === 'jomartin8264@gmail.com' ? 'JOMAR (Dueño)' : email.split('@')[0],
            role: 'admin',
            isMaster: email.toLowerCase() === 'jomartin8264@gmail.com',
            createdAt: new Date().toISOString()
          }));
          await setDoc(doc(db, "config", "staff"), { users: sList });
        }
        setStaffUsers(sList);

        // 3. Determinar rol
        const foundUser = sList.find(u => u.email?.toLowerCase() === currentEmail);
        const isMaster = currentEmail === 'jomartin8264@gmail.com';
        const isAdminUser = isMaster || emails.map(e => e.toLowerCase()).includes(currentEmail) || foundUser?.role === 'admin';
        const isEmployeeUser = foundUser?.role === 'employee';

        if (isAdminUser) {
          setUserRole('admin');
          setIsAdmin(true);
        } else if (isEmployeeUser) {
          setUserRole('employee');
          setIsAdmin(false);
        } else {
          alert("Acceso denegado: Solo el personal autorizado (Administrador o Empleado) puede entrar aquí.");
          navigate('/');
          return;
        }

        fetchProducts();
        fetchStoreInfo();
        fetchCategories();
        fetchApiSettings();
        setCheckingAccess(false);
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
        uploadedUrl = await compressImageToBase64(imageFile);
        if (!uploadedUrl) {
          uploadedUrl = await uploadToImgBB(imageFile);
        }
        if (!uploadedUrl) {
          alert("Error al procesar la imagen seleccionada.");
          setLoading(false);
          return;
        }
      }

      if (editingId) {
        const productCode = (editForm.code && editForm.code.trim()) ? editForm.code.trim() : generateAutoSKU();
        const updateData = { 
          ...editForm, 
          code: productCode,
          sku: productCode,
          price: Number(editForm.price), 
          stock: Number(editForm.stock),
          availableOnline: editForm.availableOnline !== false
        };
        if (uploadedUrl) updateData.image = uploadedUrl;
        await updateDoc(doc(db, "products", editingId), updateData);
        alert("¡Prenda actualizada!");
        setEditingId(null);
      } else {
        if (!uploadedUrl) {
          if (newProduct.availableOnline) {
            const proceed = window.confirm("Has marcado publicar en la web pero no has elegido foto. ¿Deseas publicarla con el logo de la tienda o prefieres tomar una foto primero?");
            if (!proceed) {
              setLoading(false);
              return;
            }
          }
          uploadedUrl = '/images/brand_logo_1774572391476.png';
        }
        const productCode = (newProduct.code && newProduct.code.trim()) ? newProduct.code.trim() : generateAutoSKU();
        const authorEmail = currentUser.email || 'desconocido';
        const authorName = currentUser.displayName || authorEmail.split('@')[0];
        await addDoc(collection(db, "products"), {
          ...newProduct,
          code: productCode,
          sku: productCode,
          image: uploadedUrl,
          price: Number(newProduct.price),
          stock: Number(newProduct.stock),
          size: newProduct.size || 'M',
          availableOnline: Boolean(newProduct.availableOnline),
          createdBy: authorEmail,
          createdByName: authorName,
          createdAt: new Date().toISOString(),
          labeled: Boolean(newProduct.code && newProduct.code.trim())
        });
        alert(`¡Prenda registrada con éxito!\nCódigo SKU: ${productCode}\nCanal: ${newProduct.availableOnline ? '🌐 Publicado en Web y Tienda' : '🏬 Solo Tienda Física'}`);
      }
      clearForm();
      fetchProducts();
    } catch (error) {
      alert("Error al guardar: " + (error.message || error));
    }
    setLoading(false);
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      price: product.price,
      stock: product.stock,
      code: product.code || generateAutoSKU(),
      size: product.size || 'M',
      image: product.image,
      category: product.category || categories[0],
      description: product.description || '',
      availableOnline: product.availableOnline !== false
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores pueden eliminar prendas del inventario.");
      return;
    }
    if (window.confirm("¿Eliminar prenda? Esta acción no se puede deshacer.")) {
      await deleteDoc(doc(db, "products", id));
      fetchProducts();
    }
  };

  const clearForm = () => {
    setNewProduct({ name: '', price: '', stock: '1', code: '', size: 'M', image: '', category: categories[0] || '', description: '', availableOnline: false });
    setEditingId(null);
    setImageFile(null);
  };

  // Promover una prenda "Solo Tienda" para que se publique en la Tienda Web
  const handleConfirmPromote = async (e) => {
    e.preventDefault();
    if (!promotingProduct) return;
    setIsPromoting(true);
    try {
      let uploadedUrl = null;
      if (promoteImageFile) {
        uploadedUrl = await compressImageToBase64(promoteImageFile);
        if (!uploadedUrl) {
          uploadedUrl = await uploadToImgBB(promoteImageFile);
        }
      }
      const updateData = {
        availableOnline: true
      };
      if (uploadedUrl) {
        updateData.image = uploadedUrl;
      }
      await updateDoc(doc(db, "products", promotingProduct.id), updateData);
      alert(`¡"${promotingProduct.name}" ahora está publicada y disponible en la tienda web!`);
      setPromotingProduct(null);
      setPromoteImageFile(null);
      fetchProducts();
    } catch (err) {
      alert("Error al publicar en la web: " + (err.message || err));
    } finally {
      setIsPromoting(false);
    }
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
    if (!email) return;
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) return alert("Usuario no encontrado en el sistema. Debe registrarse primero.");
    
    if (!adminList.includes(email)) {
      const updated = [...adminList, email];
      await setDoc(doc(db, "config", "admins"), { emails: updated });
      setAdminList(updated);
    }

    let updatedStaff = [...staffUsers];
    const existingIndex = updatedStaff.findIndex(u => u.email.toLowerCase() === email);
    if (existingIndex >= 0) {
      updatedStaff[existingIndex].role = 'admin';
    } else {
      updatedStaff.push({
        email,
        name: email.split('@')[0],
        role: 'admin',
        isMaster: false,
        createdAt: new Date().toISOString()
      });
    }
    await setDoc(doc(db, "config", "staff"), { users: updatedStaff });
    setStaffUsers(updatedStaff);
    setNewAdmin('');
    alert(`¡${email} ahora tiene permisos de Administrador!`);
  };

  const handleRemoveAdmin = async (email) => {
    if (email === 'jomartin8264@gmail.com') {
      alert("No puedes revocar los permisos del administrador principal.");
      return;
    }
    if (!window.confirm(`¿Revocar permisos de administrador a ${email}?`)) return;
    const updated = adminList.filter(e => e !== email);
    await setDoc(doc(db, "config", "admins"), { emails: updated });
    setAdminList(updated);

    const updatedStaff = staffUsers.map(u => {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return { ...u, role: 'employee' };
      }
      return u;
    });
    await setDoc(doc(db, "config", "staff"), { users: updatedStaff });
    setStaffUsers(updatedStaff);
  };

  if (checkingAccess) return <div style={{ paddingTop: '150px', textAlign: 'center' }}><p>Verificando...</p></div>;

  return (
    <>
      <Navbar />
      <div className="admin-container" style={{ paddingTop: '100px', paddingBottom: '50px' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ color: 'var(--color-primary)', margin: 0 }}>
                {isAdmin ? 'Panel de Administración' : 'Panel de Inventario y Registro'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem' }}>
                <span style={{ 
                  backgroundColor: isAdmin ? 'rgba(234, 179, 8, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                  color: isAdmin ? '#eab308' : '#38bdf8',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  border: `1px solid ${isAdmin ? 'rgba(234, 179, 8, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`
                }}>
                  {isAdmin ? '👑 Administrador' : '👔 Empleado'}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  {currentUser?.email}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowQuickEntryModal(true)}
                className="btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: 'bold', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                title="Alta ultrarrápida escaneando código ya pegado"
              >
                ⚡ Alta Rápida (Pistola / Celular)
              </button>
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                title="Imprimir múltiples etiquetas en hoja tamaño carta"
              >
                🏷️ Imprimir Hoja de Etiquetas
              </button>
              <button 
                onClick={() => navigate('/pos')}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: 'bold' }}
              >
                🏪 Abrir Punto de Venta (Mostrador)
              </button>
            </div>
          </div>
          
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
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span>Código de Barras / SKU</span>
                    <span style={{ fontSize: '0.75rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                      🎯 Escanear o Auto
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Escanea el código de la etiqueta pegada (o déjalo en blanco para auto)"
                    value={editingId ? (editForm.code || '') : (newProduct.code || '')}
                    onChange={(e) => editingId ? setEditForm({...editForm, code: e.target.value}) : setNewProduct({...newProduct, code: e.target.value})}
                    className="input-field"
                    style={{ fontFamily: 'monospace', fontWeight: 700 }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.35rem', display: 'block' }}>
                    Si ya le pegaste un sticker pre-impreso, dale el pistolazo aquí. Si lo dejas vacío, el sistema generará uno automáticamente.
                  </small>
                </div>

                {/* TALLA */}
                <div className="form-group">
                  <label>Talla</label>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                    {['CH', 'M', 'G', 'XL', 'Uni'].map(t => {
                      const curSize = editingId ? editForm.size : newProduct.size;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => editingId ? setEditForm({...editForm, size: t}) : setNewProduct({...newProduct, size: t})}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '5px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            border: curSize === t ? '1px solid #38bdf8' : '1px solid #334155',
                            backgroundColor: curSize === t ? '#38bdf8' : 'var(--color-surface)',
                            color: curSize === t ? '#0f172a' : '#cbd5e1',
                            cursor: 'pointer'
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <input 
                    type="text" 
                    placeholder="O escribe otra talla (ej. 32, 7.5)" 
                    value={editingId ? (editForm.size || '') : (newProduct.size || '')} 
                    onChange={(e) => editingId ? setEditForm({...editForm, size: e.target.value}) : setNewProduct({...newProduct, size: e.target.value})} 
                    className="input-field" 
                  />
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

                {/* CANAL DE VENTA */}
                <div className="form-group" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 700, color: '#fff' }}>
                    <input
                      type="checkbox"
                      checked={editingId ? (editForm.availableOnline !== false) : Boolean(newProduct.availableOnline)}
                      onChange={(e) => editingId ? setEditForm({...editForm, availableOnline: e.target.checked}) : setNewProduct({...newProduct, availableOnline: e.target.checked})}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#38bdf8' }}
                    />
                    <span>🌐 Publicar en Tienda Web (Catálogo Clientes)</span>
                  </label>
                  <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.35rem', display: 'block', marginLeft: '1.6rem' }}>
                    Si lo desmarcas, se guardará como 🏬 <strong>Solo Tienda Física</strong> (no se exhibirá en la página web y no requiere foto obligatoria).
                  </small>
                </div>

                <div className="form-group">
                  <label>📸 Foto de la Prenda {(editingId ? editForm.availableOnline : newProduct.availableOnline) ? '(Recomendada para la web)' : '(Opcional para tienda física)'}</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files[0])} 
                    className="input-field" 
                    style={{ padding: '0.6rem' }}
                  />
                  {imageFile && (
                    <div style={{ marginTop: '0.5rem', color: '#34d399', fontSize: '0.85rem' }}>
                      ✓ Foto seleccionada: {imageFile.name}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Descripción o Notas (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Algodón 100%, corte regular" 
                    value={editingId ? (editForm.description || '') : (newProduct.description || '')} 
                    onChange={(e) => editingId ? setEditForm({...editForm, description: e.target.value}) : setNewProduct({...newProduct, description: e.target.value})} 
                    className="input-field" 
                  />
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
                      <img 
                        src={getProductImage(p)} 
                        alt={p.name} 
                        style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} 
                        onError={(e) => { e.target.onerror = null; e.target.src = '/images/brand_logo_1774572391476.png'; }}
                      />
                    )}
                    <div className="inventory-info" style={{ flex: 1, marginLeft: '15px' }}>
                      <strong>{p.name}</strong> <span style={{ fontSize: '0.75rem', color: '#888', userSelect: 'all' }}>(ID: {p.id})</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                        <span>${p.price}</span> | <span>Stock: {p.stock}</span> | <span>SKU: {p.code || p.sku || 'N/A'}</span>
                        {p.size && (
                          <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                            Talla: {p.size}
                          </span>
                        )}
                        <span style={{ color: 'var(--color-secondary)' }}>{p.category}</span>
                        {p.availableOnline === false ? (
                          <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.35)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
                            🏬 Solo Tienda
                          </span>
                        ) : (
                          <span style={{ backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.35)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
                            🌐 En Web
                          </span>
                        )}
                      </div>
                      {(p.createdByName || p.createdBy) && (
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '3px' }}>
                          👤 Alta por: <strong>{p.createdByName || p.createdBy?.split('@')[0]}</strong>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {p.availableOnline === false && (
                        <button
                          type="button"
                          onClick={() => setPromotingProduct(p)}
                          className="btn btn-sm"
                          title="Tomar foto y publicar en la tienda web"
                          style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                        >
                          📸 Publicar Web
                        </button>
                      )}
                      <button 
                        type="button" 
                        onClick={() => setSelectedBarcodeProduct(p)} 
                        className="btn btn-sm" 
                        title="Imprimir código de barras"
                        style={{ backgroundColor: 'rgba(56,189,248,0.2)', color: '#38bdf8' }}
                      >
                        🏷️ Barcode
                      </button>
                      <button onClick={() => handleEdit(p)} className="btn btn-sm">Edit</button>
                      {isAdmin && (
                        <button 
                          onClick={() => handleDelete(p.id)} 
                          className="btn btn-danger btn-sm"
                          title="Eliminar prenda (Solo Administrador)"
                        >
                          X
                        </button>
                      )}
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
                  {c} {isAdmin && <b onClick={() => handleRemoveCategory(c)} style={{ color: 'red', cursor: 'pointer' }}>×</b>}
                </span>
              ))}
            </div>
          </div>

          {isAdmin && (
            <>
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
            </>
          )}

        </div>
      </div>

      {selectedBarcodeProduct && (
        <BarcodeModal 
          product={selectedBarcodeProduct} 
          onClose={() => setSelectedBarcodeProduct(null)} 
        />
      )}

      {showBatchModal && (
        <BatchBarcodeModal 
          products={products} 
          onClose={() => setShowBatchModal(false)} 
        />
      )}

      {/* MODAL DE ALTA RÁPIDA DE PRENDAS (PC Y CELULAR) */}
      {showQuickEntryModal && (
        <QuickProductEntryModal
          isOpen={showQuickEntryModal}
          onClose={() => setShowQuickEntryModal(false)}
          categories={categories}
          onProductSaved={() => fetchProducts()}
        />
      )}

      {/* MODAL PARA PROMOVER PRENDA "SOLO TIENDA" A LA TIENDA WEB */}
      {promotingProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '1.5rem',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              📸 Publicar en Tienda Web
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Publica <strong>"{promotingProduct.name}"</strong> (SKU: {promotingProduct.code || promotingProduct.sku}) en el catálogo online para que tus clientes puedan comprarla.
            </p>

            <form onSubmit={handleConfirmPromote}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                  Foto de la Prenda:
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setPromoteImageFile(e.target.files[0])}
                  className="input-field"
                  style={{ padding: '0.6rem' }}
                />
                {promoteImageFile && (
                  <div style={{ marginTop: '0.35rem', color: '#34d399', fontSize: '0.8rem' }}>
                    ✓ Foto seleccionada: {promoteImageFile.name}
                  </div>
                )}
                <small style={{ color: '#94a3b8', fontSize: '0.72rem', display: 'block', marginTop: '0.35rem' }}>
                  Si no seleccionas foto nueva, se usará el logotipo de la tienda.
                </small>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setPromotingProduct(null);
                    setPromoteImageFile(null);
                  }}
                  className="btn"
                  style={{ flex: 1, backgroundColor: '#334155', color: '#fff' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPromoting}
                  className="btn btn-primary"
                  style={{ flex: 1.5, backgroundColor: '#10b981', color: '#0f172a', fontWeight: 700 }}
                >
                  {isPromoting ? 'Publicando...' : '✓ Publicar en Web'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Admin;
