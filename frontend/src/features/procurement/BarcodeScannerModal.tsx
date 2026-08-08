import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, ScanLine } from 'lucide-react';

interface BarcodeScannerModalProps {
  onDetect: (code: string) => void;
  onClose: () => void;
}

const SCAN_REGION_ID = 'barcode-scan-region';

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ onDetect, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasDetectedRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5Qrcode(SCAN_REGION_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
      ],
      verbose: false,
    });
    scannerRef.current = scanner;

    // Calling stop() before start() has actually settled throws synchronously
    // inside html5-qrcode (seen with React's dev-mode double-effect-invoke,
    // and whenever the modal closes while the permission prompt is still
    // pending) — so cleanup below waits on this exact promise before ever
    // touching stop(), instead of assuming the scanner is running.
    const startPromise = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        // The camera keeps decoding every frame while the modal is closing —
        // only forward the first hit so one physical scan can't fire twice.
        if (hasDetectedRef.current) return;
        hasDetectedRef.current = true;
        onDetect(decodedText);
      },
      () => {
        // Per-frame "nothing recognized yet" — expected continuously while aiming, ignore.
      }
    );

    startPromise.catch((err) => {
      if (!isMounted) return;
      setError('Could not access the camera. Check permissions and try again.');
      console.error('Barcode scanner start failed:', err);
    });

    return () => {
      isMounted = false;
      startPromise
        .then(() => {
          try {
            return scanner.stop();
          } catch {
            return undefined;
          }
        })
        .then(() => {
          try {
            scanner.clear();
          } catch {
            // ignore
          }
        })
        .catch(() => {
          // start() itself never resolved (e.g. permission denied) — nothing to stop.
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 bg-slate-950/40 border-b border-slate-800">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-indigo-400" /> Scan to Receive
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{error}</div>
          )}
          <div id={SCAN_REGION_ID} className="w-full rounded-xl overflow-hidden bg-black min-h-[220px]" />
          <p className="text-[11px] text-slate-500 text-center">
            Point the camera at the barcode or QR code tagged on an ingredient.
          </p>
        </div>
      </div>
    </div>
  );
};
