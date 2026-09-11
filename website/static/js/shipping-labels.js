// Shipping Labels — Avery 5168 (PORTRAIT letter, 4 labels per sheet, 2x2)
// Each corner (LT/RT/LB/RB) accepts its own PDF upload. One print button generates
// a single portrait sheet with all filled positions.
// Slot size: 3.5" wide x 5" tall. Labels are auto-oriented to fit the slot.
(function() {
    'use strict';

    window.__shippingLabelsLoaded = true;
    console.log('🚀 Shipping Labels module loaded');

    // ========== AVERY 5168 GEOMETRY (inches, PORTRAIT sheet 8.5 x 11) ==========
    // Label 3.5" wide x 5" tall. Sheet layout:
    //   0.5" top/left/right/bottom margins, 0.5" horizontal gap, 0" vertical gap
    // Positions (top-left of each label):
    //   LT (0.5, 0.5)   RT (4.5, 0.5)
    //   LB (0.5, 5.5)   RB (4.5, 5.5)
    const LABEL_W = 3.5;
    const LABEL_H = 5;
    const POS_GEOM = {
        LT: { x: 0.5, y: 0.5 },
        RT: { x: 4.5, y: 0.5 },
        LB: { x: 0.5, y: 5.5 },
        RB: { x: 4.5, y: 5.5 }
    };
    const ALL_POSITIONS = ['LT', 'RT', 'LB', 'RB'];

    const PDFJS_CDNS = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    ];
    const PDFJS_WORKERS = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    ];

    // Per-position rendered canvas (300 DPI, already oriented to fit slot)
    const labelCanvases = { LT: null, RT: null, LB: null, RB: null };
    const labelFileNames = { LT: '', RT: '', LB: '', RB: '' };

    let pdfjsReady = false;
    let pdfjsLoading = null;
    let handlersAttached = false;

    // ========== PDF.JS LOADER ==========
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[src="' + src + '"]');
            if (existing) { resolve(); return; }
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    async function ensurePdfJs() {
        if (pdfjsReady && window.pdfjsLib) return;
        if (pdfjsLoading) return pdfjsLoading;

        pdfjsLoading = (async () => {
            let loaded = false;
            let lastErr = null;
            for (let i = 0; i < PDFJS_CDNS.length; i++) {
                try {
                    await loadScript(PDFJS_CDNS[i]);
                    if (window.pdfjsLib) {
                        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKERS[i]; } catch (e) {}
                        loaded = true;
                        console.log('✅ PDF.js loaded from', PDFJS_CDNS[i]);
                        break;
                    }
                } catch (e) {
                    lastErr = e;
                    console.warn('PDF.js CDN failed:', PDFJS_CDNS[i], e.message);
                }
            }
            if (!loaded || !window.pdfjsLib) {
                throw new Error('Could not load PDF.js.' + (lastErr ? ' (' + lastErr.message + ')' : ''));
            }
            pdfjsReady = true;
        })();

        return pdfjsLoading;
    }

    // ========== CANVAS HELPERS ==========
    function rotate90(src) {
        const out = document.createElement('canvas');
        out.width = src.height;
        out.height = src.width;
        const ctx = out.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.translate(out.width / 2, out.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(src, -src.width / 2, -src.height / 2);
        return out;
    }

    // ========== FIT MATH ==========
    // Fit source into 3.5 x 5, preserving aspect ratio
    function fitToLabel(srcW, srcH) {
        const srcAspect = srcW / srcH;
        const labelAspect = LABEL_W / LABEL_H;   // 0.7
        let w, h;
        if (srcAspect > labelAspect) {
            w = LABEL_W;
            h = LABEL_W / srcAspect;
        } else {
            h = LABEL_H;
            w = LABEL_H * srcAspect;
        }
        return { w, h };
    }

    // Try as-is vs rotated 90°. Pick whichever fills more of the portrait slot.
    // For a 4x6 carrier label into a 3.5x5 portrait slot, as-is wins (no rotation).
    // For a landscape label, rotation wins.
    function orientForSlot(src) {
        const asIs = fitToLabel(src.width, src.height);
        const rotatedDims = fitToLabel(src.height, src.width);
        const asIsArea = asIs.w * asIs.h;
        const rotatedArea = rotatedDims.w * rotatedDims.h;

        if (rotatedArea > asIsArea * 1.05) {
            console.log('🔄 Auto-rotating ' + src.width + 'x' + src.height +
                        ' → ' + src.height + 'x' + src.width + ' for portrait slot');
            return rotate90(src);
        }
        return src;
    }

    // ========== UI HELPERS ==========
    function getSlot(pos) {
        return document.querySelector('.sl-slot[data-pos="' + pos + '"]');
    }

    function setSlotLoading(pos, loading) {
        const slot = getSlot(pos);
        if (!slot) return;
        slot.classList.toggle('loading', !!loading);
    }

    function refreshSlot(pos) {
        const slot = getSlot(pos);
        if (!slot) return;
        const btn = slot.querySelector('.sl-slot-upload');
        const img = slot.querySelector('.sl-slot-img');
        const rm = slot.querySelector('.sl-slot-remove');
        const canvas = labelCanvases[pos];

        if (canvas) {
            slot.classList.add('filled');
            if (btn) btn.style.display = 'none';
            if (img) {
                img.src = canvas.toDataURL('image/jpeg', 0.85);
                img.style.display = 'block';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
            }
            if (rm) rm.style.display = 'flex';
        } else {
            slot.classList.remove('filled');
            if (btn) btn.style.display = 'flex';
            if (img) {
                img.removeAttribute('src');
                img.style.display = 'none';
            }
            if (rm) rm.style.display = 'none';
        }
    }

    function updatePrintButtonState() {
        const btn = document.getElementById('sl-print-btn');
        if (!btn) return;
        const anyFilled = ALL_POSITIONS.some(p => !!labelCanvases[p]);
        btn.disabled = !anyFilled;
        btn.style.opacity = anyFilled ? '1' : '0.5';
        btn.style.cursor = anyFilled ? 'pointer' : 'not-allowed';
    }

    // ========== FILE PICK ==========
    window.slPickFile = function(pos) {
        const input = document.getElementById('sl-file-' + pos);
        if (input) input.click();
    };

    // ========== HANDLE FILE FOR A POSITION ==========
    async function handleFile(pos, file) {
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showToast('❌ Please select a PDF file.', 'error');
            return;
        }

        console.log('📄 Loading', pos, '←', file.name, '(' + Math.round(file.size / 1024) + ' KB)');
        setSlotLoading(pos, true);

        try {
            await ensurePdfJs();
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            const scale = 300 / 72;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport }).promise;

            const oriented = orientForSlot(canvas);

            labelCanvases[pos] = oriented;
            labelFileNames[pos] = file.name;

            refreshSlot(pos);
            updatePrintButtonState();
            showToast('✅ ' + pos + ' label loaded');
        } catch (error) {
            console.error('PDF load error for', pos, error);
            showToast('❌ ' + pos + ': ' + error.message, 'error');
        } finally {
            setSlotLoading(pos, false);
            const input = document.getElementById('sl-file-' + pos);
            if (input) input.value = '';
        }
    }

    // ========== REMOVE ONE POSITION ==========
    window.slRemove = function(pos) {
        labelCanvases[pos] = null;
        labelFileNames[pos] = '';
        const input = document.getElementById('sl-file-' + pos);
        if (input) input.value = '';
        refreshSlot(pos);
        updatePrintButtonState();
    };

    // ========== GENERATE PRINTABLE PDF ==========
    window.slPrint = function() {
        const anyFilled = ALL_POSITIONS.some(p => !!labelCanvases[p]);
        if (!anyFilled) {
            showToast('⚠️ Upload at least one label first.', 'warning');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('❌ jsPDF library not loaded.', 'error');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            // PORTRAIT US Letter — matches the physical Avery 5168 sheet
            const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

            ALL_POSITIONS.forEach(pos => {
                const canvas = labelCanvases[pos];
                if (!canvas) return;

                const fit = fitToLabel(canvas.width, canvas.height);
                const g = POS_GEOM[pos];
                const drawX = g.x + (LABEL_W - fit.w) / 2;
                const drawY = g.y + (LABEL_H - fit.h) / 2;
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                doc.addImage(imgData, 'JPEG', drawX, drawY, fit.w, fit.h);
            });

            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (!win) {
                showToast('⚠️ Pop-up blocked — allow pop-ups to see the PDF.', 'warning');
            } else {
                showToast('✅ PDF ready — print at 100%.');
            }
        } catch (error) {
            console.error('PDF generation error:', error);
            showToast('❌ PDF generation failed: ' + error.message, 'error');
        }
    };

    // ========== TOAST ==========
    function showToast(message, type) {
        type = type || 'success';
        const existing = document.querySelector('.sl-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'sl-toast';
        const bgColor = type === 'success' ? '#28a745'
                     : type === 'error' ? '#dc3545'
                     : type === 'warning' ? '#ffc107' : '#007bff';
        toast.style.cssText = [
            'position: fixed',
            'bottom: 20px',
            'right: 20px',
            'padding: 12px 20px',
            'border-radius: 8px',
            'background: ' + bgColor,
            'color: ' + (type === 'warning' ? '#333' : 'white'),
            'font-weight: 600',
            'z-index: 99999',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
            'max-width: 400px',
            'font-size: 14px'
        ].join(';');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ========== GLOBAL EVENT DELEGATION ==========
    function attachGlobalHandlers() {
        if (handlersAttached) return;
        handlersAttached = true;

        document.addEventListener('change', function(e) {
            const t = e.target;
            if (!t || !t.id || t.id.indexOf('sl-file-') !== 0) return;
            const pos = t.id.replace('sl-file-', '');
            if (ALL_POSITIONS.indexOf(pos) === -1) return;
            const file = t.files && t.files[0];
            if (file) handleFile(pos, file);
        });

        console.log('✅ Shipping Labels handlers attached');
    }

    // ========== INIT ==========
    window.initShippingLabels = function() {
        console.log('📦 initShippingLabels called');
        attachGlobalHandlers();
        ALL_POSITIONS.forEach(refreshSlot);
        updatePrintButtonState();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachGlobalHandlers);
    } else {
        attachGlobalHandlers();
    }

    const mo = new MutationObserver(() => {
        if (document.querySelector('.sl-slot') && !window.__slReady) {
            window.__slReady = true;
            ALL_POSITIONS.forEach(refreshSlot);
            updatePrintButtonState();
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

})();