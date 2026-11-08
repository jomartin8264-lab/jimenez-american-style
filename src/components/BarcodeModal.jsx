import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';

export default function BarcodeModal({ product, onClose }) {
  const svgRef = useRef(null);

  const barcodeValue = product?.code || product?.sku || product?.id;

  useEffect(() => {
    if (svgRef.current && barcodeValue) {
      try {
        JsBarcode(svgRef.current, String(barcodeValue), {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 14,
          margin: 6,
          background: "#ffffff",
          lineColor: "#000000"
        });
      } catch (err) {
        console.error("Error al generar código de barras:", err);
      }
    }
  }, [product, barcodeValue]);

  if (!product) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#fff',
        color: '#111',
        borderRadius: '12px',
        maxWidth: '450px',
        width: '100%',
        padding: '1.5rem',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Etiqueta de Código de Barras</h3>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Zona imprimible */}
        <div id="printable-barcode-tag" style={{
          border: '2px dashed #ccc',
          padding: '1.2rem',
          borderRadius: '8px',
          background: '#fff',
          margin: '1rem 0'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
            {product.name}
          </div>
          <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            {product.category || 'Prenda'} • SKU: {barcodeValue || 'S/C'}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981', marginBottom: '0.5rem' }}>
            ${Number(product.price).toFixed(2)} MXN
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg ref={svgRef}></svg>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={handlePrint}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Printer size={18} /> Imprimir Etiqueta
          </button>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#e5e7eb',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 1.25rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
