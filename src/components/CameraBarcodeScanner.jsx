import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, AlertCircle } from 'lucide-react';
import { soundAlert } from '../utils/soundAlert';

export default function CameraBarcodeScanner({ onScan, onClose }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);
  const containerId = "alina-camera-scanner-reader";

  useEffect(() => {
    let html5QrCode = null;

    const startScanner = async () => {
      try {
        setIsStarting(true);
        setErrorMsg('');

        // Formatos a detectar: principalmente Códigos de Barra 1D y QR
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ];

        html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            // Rectángulo horizontal optimizado para códigos de barra largos
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(viewfinderWidth * 0.85),
              height: Math.floor(minEdge * 0.45)
            };
          },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // Escaneo exitoso!
            try {
              soundAlert('beep');
            } catch (e) {}

            // Detener la cámara y devolver el resultado
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                onScan(decodedText.trim());
              }).catch(() => {
                onScan(decodedText.trim());
              });
            } else {
              onScan(decodedText.trim());
            }
          },
          () => {
            // Escaneo en proceso, no requiere acción
          }
        );

        setIsStarting(false);
      } catch (err) {
        console.error("Error al iniciar cámara de escáner:", err);
        setIsStarting(false);
        setErrorMsg(
          err.name === 'NotAllowedError' 
            ? 'Permiso de cámara denegado. Activa los permisos de la cámara en tu navegador.' 
            : `No se pudo iniciar la cámara: ${err.message || 'Error desconocido'}`
        );
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(e => console.warn("Error al detener cámara:", e));
      }
    };
  }, [onScan]);

  const handleClose = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (e) {}
    }
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.92)',
      zIndex: 100000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      {/* Botón cerrar flotante */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          border: 'none',
          color: '#fff',
          borderRadius: '50%',
          width: '42px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100001
        }}
        aria-label="Cerrar escáner"
      >
        <X size={24} />
      </button>

      {/* Encabezado */}
      <div style={{ textAlign: 'center', marginBottom: '1rem', color: '#fff' }}>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#38bdf8' }}>
          <Camera size={22} /> Escáner de Código de Barras
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
          Apunta la cámara a la etiqueta pegada en la prenda
        </p>
      </div>

      {/* Visor de la cámara */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '380px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid #38bdf8',
        boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
        backgroundColor: '#000'
      }}>
        <div id={containerId} style={{ width: '100%' }} />

        {/* Guía visual sobre el visor */}
        {!isStarting && !errorMsg && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            height: '35%',
            border: '2px dashed rgba(56, 189, 248, 0.8)',
            borderRadius: '8px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)'
          }}>
            <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px' }}>
              ENFOCA EL CÓDIGO AQUÍ
            </span>
          </div>
        )}

        {isStarting && (
          <div style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <RefreshCw size={28} className="animate-spin" color="#38bdf8" />
            <span>Iniciando cámara trasera...</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          color: '#fca5a5',
          maxWidth: '380px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Botón cancelar alternativo */}
      <button
        onClick={handleClose}
        style={{
          marginTop: '1.5rem',
          padding: '0.65rem 1.75rem',
          backgroundColor: '#334155',
          border: 'none',
          color: '#fff',
          borderRadius: '8px',
          fontSize: '0.9rem',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        Cancelar escaneo
      </button>
    </div>
  );
}
