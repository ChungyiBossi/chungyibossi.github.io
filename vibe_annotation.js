

// --- Element Selection ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const imageLoader = document.getElementById('imageLoader');
const toolbar = document.getElementById('toolbar');
const measureTool = document.getElementById('measure-tool');
const arrowTool = document.getElementById('arrow-tool');
const textTool = document.getElementById('text-tool');
const zoomAnnotationTool = document.getElementById('zoom-annotation-tool');
const previewTool = document.getElementById('preview-tool');
const clearButton = document.getElementById('clear-canvas');
const colorPicker = document.getElementById('color-picker');
const lineWidth = document.getElementById('line-width');
const lineWidthValue = document.getElementById('line-width-value');
const canvasContainer = document.getElementById('canvas-container');
const uploadContainer = document.getElementById('upload-container');
const undoTool = document.getElementById('undo-tool');
const unitCmBtn = document.getElementById('unit-cm');
const unitMmBtn = document.getElementById('unit-mm');
const copyButton = document.getElementById('copy-canvas');
const exportButton = document.getElementById('export-btn');
const exportPdfButton = document.getElementById('export-pdf-btn');
const restartButton = document.getElementById('restart-btn');
const geminiGenerateBtn = document.getElementById('gemini-generate');
const copyNotification = document.getElementById('copy-notification');
const imageTrayWrapper = document.getElementById('image-tray-wrapper');
const imageTray = document.getElementById('image-tray');
const annotationListContainer = document.getElementById('annotation-list');
const contextMenu = document.getElementById('context-menu');
const contextCopyBtn = document.getElementById('context-copy-btn');
const colorSwatches = document.getElementById('color-swatches');

const inputModal = document.getElementById('input-modal');
const modalTitle = document.getElementById('modal-title');
const modalInput = document.getElementById('modal-input');
const modalOkBtn = document.getElementById('modal-ok');
const modalCancelBtn = document.getElementById('modal-cancel');
let currentModalCallback = null;

const confirmModal = document.getElementById('confirm-modal');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalOkBtn = document.getElementById('confirm-modal-ok');
const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel');
let currentConfirmCallback = null;

const geminiModal = document.getElementById('gemini-modal');
const geminiLoader = document.getElementById('gemini-loader');
const geminiResult = document.getElementById('gemini-result');
const geminiCloseBtn = document.getElementById('gemini-close-btn');
const geminiCopyBtn = document.getElementById('gemini-copy-btn');

const previewOverlay = document.querySelector('.preview-overlay');


// --- State Variables ---
let imagesData = []; // Array of { id, image, annotations }
let activeImageIndex = -1;

let currentTool = 'measure';
let isDrawing = false;
let startPos = { x: 0, y: 0 };
let currentPos = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };
let displayUnit = 'cm';

// Pinned Zoom Annotation state
let selectedAnnotationIndex = -1;
let isResizing = false;

// --- Modal Functions ---
function showInputModal(title, initialValue = '', inputType = 'text', callback) {
    modalTitle.textContent = title;
    modalInput.type = inputType;
    modalInput.value = initialValue;
    inputModal.classList.remove('hidden');
    inputModal.classList.add('flex');
    setTimeout(() => modalInput.focus(), 50);
    currentModalCallback = callback;
}

function hideInputModal() {
    inputModal.classList.add('hidden');
    inputModal.classList.remove('flex');
    currentModalCallback = null;
}

function showConfirmModal(title, message, callback, isAlert = false) {
    confirmModalTitle.textContent = title;
    confirmModalMessage.innerHTML = message;
    confirmModal.classList.remove('hidden');
    confirmModal.classList.add('flex');
    currentConfirmCallback = callback;
    if (isAlert) {
        confirmModalCancelBtn.classList.add('hidden');
        confirmModalOkBtn.textContent = '確定';
        confirmModalOkBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
        confirmModalOkBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
    } else {
        confirmModalCancelBtn.classList.remove('hidden');
        confirmModalOkBtn.textContent = '確定';
        confirmModalOkBtn.classList.add('bg-red-500', 'hover:bg-red-600');
        confirmModalOkBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
    }
}

function hideConfirmModal() {
    confirmModal.classList.add('hidden');
    confirmModal.classList.remove('flex');
    currentConfirmCallback = null;
}

modalOkBtn.addEventListener('click', () => {
    if (currentModalCallback) { currentModalCallback(modalInput.value); }
    hideInputModal();
});

modalCancelBtn.addEventListener('click', hideInputModal);

modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { modalOkBtn.click(); } 
    else if (e.key === 'Escape') { hideInputModal(); }
});

confirmModalOkBtn.addEventListener('click', () => {
    if (currentConfirmCallback) { currentConfirmCallback(); }
    hideConfirmModal();
});

confirmModalCancelBtn.addEventListener('click', hideConfirmModal);

// --- Core Functions ---
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { 
        x: (evt.clientX - rect.left) * scaleX, 
        y: (evt.clientY - rect.top) * scaleY 
    };
}

function setActiveTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`${tool}-tool`);
    if (activeBtn) activeBtn.classList.add('active');
    canvas.style.cursor = 'crosshair';
    selectedAnnotationIndex = -1; // Deselect on tool change
    redraw();
}

function setDisplayUnit(unit) {
    displayUnit = unit;
    if (unit === 'cm') {
        unitCmBtn.classList.add('bg-gray-300'); unitMmBtn.classList.remove('bg-gray-300');
    } else {
        unitMmBtn.classList.add('bg-gray-300'); unitCmBtn.classList.remove('bg-gray-300');
    }
    redraw();
}

function resizeCanvas() {
    const isPreview = document.body.classList.contains('preview-mode');
    const targetContainer = isPreview ? previewOverlay : canvasContainer;
    
    const activeImage = getActiveImage();
    if (!activeImage) {
        canvas.width = targetContainer.clientWidth;
        canvas.height = targetContainer.clientHeight;
        redraw();
        return;
    }

    const containerWidth = targetContainer.clientWidth;
    const containerHeight = targetContainer.clientHeight;
    const imageAspectRatio = activeImage.naturalWidth / activeImage.naturalHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let canvasWidth, canvasHeight;

    if (imageAspectRatio > containerAspectRatio) {
        canvasWidth = containerWidth;
        canvasHeight = containerWidth / imageAspectRatio;
    } else {
        canvasHeight = containerHeight;
        canvasWidth = containerHeight * imageAspectRatio;
    }
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    redraw();
}

function redraw() {
    renderAnnotationList(); // Keep list in sync
    const activeImage = getActiveImage();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!activeImage || !activeImage.complete || activeImage.naturalWidth === 0) {
            uploadContainer.style.display = 'flex';
            geminiGenerateBtn.style.display = 'none';
            return;
    }
    uploadContainer.style.display = 'none';
    
    ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
    
    const annotations = getActiveAnnotations();
    const ratio = canvas.width / activeImage.naturalWidth;
    
    annotations.forEach((ann, index) => {
            if (ann.type === 'pinned_zoom') {
            // Recalculate source on the fly to handle zoom/resize
            const sourceWidth = ann.size / ann.zoom;
            const sourceHeight = ann.size / ann.zoom;
            ann.source = {
                x: ann.pos.x - sourceWidth / 2,
                y: ann.pos.y - sourceHeight / 2,
                width: sourceWidth,
                height: sourceHeight
            };

            const canvasPos = {x: ann.pos.x * ratio, y: ann.pos.y * ratio};
            const canvasSize = ann.size * ratio;
            ctx.save();
            ctx.imageSmoothingEnabled = false; // For sharper zoom
            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, canvasSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = index === selectedAnnotationIndex ? '#0ea5e9' : '#3b82f6';
            ctx.lineWidth = index === selectedAnnotationIndex ? 6 * ratio : 4 * ratio;
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.stroke();
            ctx.clip();
            ctx.drawImage(activeImage,
                ann.source.x, ann.source.y, ann.source.width, ann.source.height,
                canvasPos.x - canvasSize / 2, canvasPos.y - canvasSize / 2, canvasSize * ann.zoom, canvasSize * ann.zoom);
            ctx.restore();
            
            if (index === selectedAnnotationIndex) {
                const handlePos = getResizeHandle(ann, ratio);
                ctx.beginPath();
                ctx.arc(handlePos.x, handlePos.y, 8 * ratio, 0, Math.PI * 2);
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
            }
            drawAnnotationLabel(ann, index, canvasPos, ann.color, ratio);

        } else if (ann.type === 'measure' || ann.type === 'arrow' || ann.type === 'text') {
            const start = ann.start ? {x: ann.start.x * ratio, y: ann.start.y * ratio} : null;
            const end = ann.end ? {x: ann.end.x * ratio, y: ann.end.y * ratio} : null;
            const pos = ann.pos ? {x: ann.pos.x * ratio, y: ann.pos.y * ratio} : null;
            const scaledWidth = ann.width * ratio;

                if (ann.type !== 'text') {
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = scaledWidth;
                ctx.stroke();
                if (ann.type === 'arrow') {
                    drawArrowhead(start, end, ann.color, scaledWidth);
                }
                if (ann.type === 'measure') {
                    drawDimension(start, end, ann, ratio);
                }
                }
            
            let numberPos;
            if(ann.type === 'text') {
                numberPos = pos;
            } else if (ann.type === 'measure') {
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const midX = start.x + dx / 2;
                const midY = start.y + dy / 2;
                const len = Math.sqrt(dx*dx + dy*dy);
                const perpDx = len > 0 ? -dy / len : 0;
                const perpDy = len > 0 ? dx / len : 0;
                const offset = 30 * ratio;
                numberPos = { x: midX + perpDx * offset, y: midY + perpDy * offset };
            } else { // arrow
                numberPos = start;
            }

            if (ann.type === 'measure') {
                drawAnnotationNumber(index + 1, numberPos, ann.color, ratio);
            } else {
                drawAnnotationLabel(ann, index, numberPos, ann.color, ratio);
            }
        }
    });
    
    const textAnnotationsCount = annotations.filter(a => a.type === 'arrow' || a.type === 'text').length;
    geminiGenerateBtn.style.display = textAnnotationsCount >= 3 ? 'flex' : 'none';
}

function drawAnnotationNumber(number, pos, color, ratio = 1) {
    const radius = 12 * ratio;
    const fontSize = 16 * ratio;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number, pos.x, pos.y);
    ctx.restore();
}

function drawAnnotationLabel(ann, index, pos, color, ratio = 1) {
    const number = index + 1;
    const text = getAnnotationText(ann);
    
    let labelPos = { ...pos };
    let numberPos = { ...pos };

    if(ann.type === 'pinned_zoom') {
        const radius = (ann.size / 2) * ratio;
        numberPos.y += radius + (15 * ratio); // Place number below
        drawAnnotationNumber(number, numberPos, color, ratio);

        // Place text to the right
        labelPos.x += radius + (5 * ratio); 
        labelPos.y = pos.y; // Align text vertically with center of magnifier

    } else {
            drawAnnotationNumber(number, pos, color, ratio);
            labelPos.x += (12 * ratio) + (5 * ratio);
    }
    
    if (text && ann.type !== 'measure') { // Only draw text for non-measure types
        const labelFontSize = 48 * ratio;
        ctx.save();
        ctx.font = `${labelFontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const textMetrics = ctx.measureText(text);
        const padding = labelFontSize * 0.25;

        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(
            labelPos.x - padding, 
            labelPos.y - (labelFontSize / 2) - padding, 
            textMetrics.width + padding * 2, 
            labelFontSize + padding * 2
        );

        // Text
        ctx.fillStyle = color;
        ctx.fillText(text, labelPos.x, labelPos.y);
        ctx.restore();
    }
}

function drawArrowhead(from, to, color, width) {
    const headlen = 10 + width;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

function drawDimension(start, end, ann, ratio) {
    drawArrowhead(end, start, ann.color, ann.width * ratio);
    drawArrowhead(start, end, ann.color, ann.width * ratio);

    let displayValue = ann.value;
    if (ann.originalUnit === 'cm' && displayUnit === 'mm') displayValue *= 10;
    else if (ann.originalUnit === 'mm' && displayUnit === 'cm') displayValue /= 10;
    const text = `${displayValue.toFixed(1)} ${displayUnit}`;
    const dx = end.x - start.x, dy = end.y - start.y;
    const midX = start.x + dx / 2, midY = start.y + dy / 2;
    const font_size = 48 * ratio;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.font = `${font_size}px sans-serif`;
    ctx.textAlign = 'center';
    const textMetrics = ctx.measureText(text);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const padding = font_size * 0.25;
    ctx.fillRect(-textMetrics.width / 2 - padding, -font_size / 2 - padding, textMetrics.width + padding * 2, font_size + padding * 2);
    ctx.fillStyle = ann.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function createZoomAnnotation(canvasClickPos) {
    const activeImage = getActiveImage();
    if (!activeImage) return;

    const pos = getOriginalPos(canvasClickPos);

    showInputModal('請輸入放大註釋文字:', '', 'text', (text) => {
        const initialSize = 150;
        
        getActiveAnnotations().push({
            type: 'pinned_zoom',
            text: text || "放大細節",
            pos: pos,
            size: initialSize,
            zoom: 3,
            color: colorPicker.value,
            source: {} // Will be calculated dynamically in redraw
        });
        redraw();
        setActiveTool('arrow');
    });
}

function handleImageUpload(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const newImageData = {
                    id: Date.now() + Math.random(),
                    image: img,
                    annotations: [],
                };
                imagesData.push(newImageData);
                setActiveImage(imagesData.length - 1); // Activate the newly added image
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    }
}

function showCopyNotification(e) {
    const rect = document.body.getBoundingClientRect();
    copyNotification.style.left = `${e.clientX - rect.left}px`;
    copyNotification.style.top = `${e.clientY - rect.top}px`;
    copyNotification.classList.remove('hidden');
    copyNotification.style.opacity = '1';
    setTimeout(() => {
        copyNotification.style.opacity = '0';
        setTimeout(() => copyNotification.classList.add('hidden'), 300);
    }, 1500);
}

// --- EXPORT AND COPY LOGIC ---
function generateProductSheet(isExport, callback) {
    const activeImage = getActiveImage();
    if (!activeImage) {
        showConfirmModal('錯誤', '請先上傳一張圖片。', () => {}, true);
        return;
    }

    const annotations = getActiveAnnotations();
    const listWidth = isExport ? 400 : 0;
    const padding = 20;
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = activeImage.naturalWidth + listWidth;
    tempCanvas.height = activeImage.naturalHeight;
    
    // White background
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw image
    tempCtx.drawImage(activeImage, 0, 0);

    // Draw annotations on image
    annotations.forEach((ann, index) => {
            if (ann.type === 'pinned_zoom') {
            tempCtx.save();
            tempCtx.imageSmoothingEnabled = false;
            tempCtx.beginPath();
            tempCtx.arc(ann.pos.x, ann.pos.y, ann.size / 2, 0, Math.PI * 2);
            tempCtx.strokeStyle = '#3b82f6'; tempCtx.lineWidth = 4;
            tempCtx.fillStyle = 'white'; tempCtx.fill(); tempCtx.stroke();
            tempCtx.clip();
            tempCtx.drawImage(activeImage, ann.source.x, ann.source.y, ann.source.width, ann.source.height, ann.pos.x - ann.size / 2, ann.pos.y - ann.size / 2, ann.size * ann.zoom, ann.size * ann.zoom);
            tempCtx.restore();
            } else if (ann.type === 'measure' || ann.type === 'arrow') {
            tempCtx.beginPath(); tempCtx.moveTo(ann.start.x, ann.start.y);
            tempCtx.lineTo(ann.end.x, ann.end.y); tempCtx.strokeStyle = ann.color;
            tempCtx.lineWidth = ann.width; tempCtx.stroke();
            if (ann.type === 'arrow') {
                drawArrowheadOnCtx(tempCtx, ann.start, ann.end, ann.color, ann.width);
            }
            if (ann.type === 'measure' && ann.value !== undefined) {
                drawDimensionOnCtx(tempCtx, ann);
            }
        }
        
        let numberPos;
        if(ann.type === 'text' || ann.type === 'pinned_zoom') {
            numberPos = ann.pos;
        } else if (ann.type === 'measure') {
            const dx = ann.end.x - ann.start.x;
            const dy = ann.end.y - ann.start.y;
            const midX = ann.start.x + dx / 2;
            const midY = ann.start.y + dy / 2;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len === 0) {
                numberPos = { x: midX, y: midY };
            } else {
                const perpDx = -dy / len;
                const perpDy = dx / len;
                const offset = 30; 
                numberPos = {
                    x: midX + perpDx * offset,
                    y: midY + perpDy * offset
                };
            }
        } else { // arrow
            numberPos = ann.start;
        }

        if (ann.type === 'measure') {
            drawAnnotationNumberOnCtx(tempCtx, index + 1, numberPos, ann.color);
        } else {
            drawAnnotationLabelOnCtx(tempCtx, index + 1, ann, numberPos, ann.color);
        }
    });

    // Draw annotation list on the right side if exporting
    if(isExport) {
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(activeImage.naturalWidth, 0, listWidth, tempCanvas.height);
        tempCtx.strokeStyle = '#e5e7eb'; tempCtx.lineWidth = 1;
        tempCtx.beginPath(); tempCtx.moveTo(activeImage.naturalWidth, 0);
        tempCtx.lineTo(activeImage.naturalWidth, tempCanvas.height); tempCtx.stroke();
        tempCtx.fillStyle = '#1f2937'; tempCtx.font = 'bold 24px sans-serif';
        tempCtx.fillText('註釋列表', activeImage.naturalWidth + padding, padding + 24);

        let currentY = padding + 70;
        annotations.forEach((ann, index) => {
            const text = getAnnotationText(ann);
            
            tempCtx.font = 'bold 18px sans-serif';
            const numberText = `${index + 1}.`;
            
            tempCtx.fillStyle = ann.color || '#1f2937';
            tempCtx.fillText(numberText, activeImage.naturalWidth + padding, currentY);

            tempCtx.font = '18px sans-serif';
            tempCtx.fillStyle = '#374151';
            currentY = wrapText(tempCtx, text, activeImage.naturalWidth + padding + 40, currentY, listWidth - padding * 2 - 50, 24);
            
            currentY += 20; 
        });
    }
    
    callback(tempCanvas);
}

function drawAnnotationLabelOnCtx(targetContext, number, ann, pos, color) {
    let labelPos = { ...pos };
    let numberPos = { ...pos };
    const text = ann.text;

    if(ann.type === 'pinned_zoom') {
            const radius = ann.size / 2;
            numberPos.y += radius + 15;
            drawAnnotationNumberOnCtx(targetContext, number, numberPos, color);

            labelPos.x += radius + 5;
    } else {
        drawAnnotationNumberOnCtx(targetContext, number, pos, color);
        labelPos.x += 12 + 5;
    }

    if (text && ann.type !== 'measure') {
        const labelFontSize = 48; // Large font size for export
        targetContext.save();
        targetContext.font = `${labelFontSize}px sans-serif`;
        targetContext.fillStyle = color;
        targetContext.textAlign = 'left';
        targetContext.textBaseline = 'middle';
        
        const textMetrics = targetContext.measureText(text);
        const padding = labelFontSize * 0.25;

        // Background
        targetContext.fillStyle = 'rgba(255, 255, 255, 0.85)';
        targetContext.fillRect(labelPos.x - padding, labelPos.y - (labelFontSize / 2) - padding, textMetrics.width + padding * 2, labelFontSize + padding * 2);

        // Text
        targetContext.fillStyle = color;
        targetContext.fillText(text, labelPos.x, labelPos.y);
        targetContext.restore();
    }
}

function drawAnnotationNumberOnCtx(targetContext, number, pos, color) {
    const radius = 12; const fontSize = 16;
    targetContext.save();
    targetContext.beginPath(); targetContext.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    targetContext.fillStyle = color; targetContext.fill();
    targetContext.font = `bold ${fontSize}px sans-serif`;
    targetContext.fillStyle = 'white'; targetContext.textAlign = 'center'; targetContext.textBaseline = 'middle';
    targetContext.fillText(number, pos.x, pos.y);
    targetContext.restore();
}
function drawArrowheadOnCtx(targetContext, from, to, color, width) {
    const headlen = 10 + width; const angle = Math.atan2(to.y - from.y, to.x - from.x);
    targetContext.strokeStyle = color; targetContext.lineWidth = width;
    targetContext.beginPath(); targetContext.moveTo(to.x, to.y);
    targetContext.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
    targetContext.moveTo(to.x, to.y);
    targetContext.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
    targetContext.stroke();
}
function drawDimensionOnCtx(targetContext, ann) {
    drawArrowheadOnCtx(targetContext, ann.end, ann.start, ann.color, ann.width);
    drawArrowheadOnCtx(targetContext, ann.start, ann.end, ann.color, ann.width);

    let displayValue = ann.value;
    if (ann.originalUnit === 'cm' && displayUnit === 'mm') displayValue *= 10;
    else if (ann.originalUnit === 'mm' && displayUnit === 'cm') displayValue /= 10;
    const text = `${displayValue.toFixed(1)} ${displayUnit}`;
    const dx = ann.end.x - ann.start.x, dy = ann.end.y - ann.start.y;
    const midX = ann.start.x + dx/2, midY = ann.start.y + dy/2;
    targetContext.save();
    targetContext.translate(midX, midY); targetContext.rotate(Math.atan2(dy, dx));
    const fontSize = 48;
    targetContext.font = `${fontSize}px sans-serif`;
    targetContext.textAlign = 'center';
    const textMetrics = targetContext.measureText(text);
    targetContext.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const padding = fontSize * 0.25;
    targetContext.fillRect(-textMetrics.width/2 - padding, -fontSize/2 - padding, textMetrics.width + padding*2, fontSize + padding*2);
    targetContext.fillStyle = ann.color; 
    targetContext.textBaseline = 'middle';
    targetContext.fillText(text, 0, 0);
    targetContext.restore();
}
function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' '); let line = '';
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else { line = testLine; }
    }
    context.fillText(line, x, y);
    return y + lineHeight;
}

function exportProductSheet() {
    generateProductSheet(true, tempCanvas => {
        const link = document.createElement('a');
        link.download = `product-sheet-${Date.now()}.png`;
        link.href = tempCanvas.toDataURL("image/png");
        link.click();
    });
}

async function copyCanvasToClipboard(e, tempCanvas) {
    tempCanvas.toBlob(async (blob) => {
        if (!blob) {
            showConfirmModal('複製失敗', '無法將畫布轉換為圖片格式。', () => {}, true);
            return;
        }
        try {
            await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
            if (e && e.type === 'contextmenu') {
                showCopyNotification(e);
            } else {
                const originalHTML = copyButton.innerHTML;
                copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>已複製!</span>`;
                setTimeout(() => { copyButton.innerHTML = originalHTML; }, 2500);
            }
        } catch (err) {
            const errorMessage = '由於瀏覽器安全限制，無法自動複製。<br><br>請改用螢幕截圖工具 (例如 Windows: <b>Win+Shift+S</b>, Mac: <b>Cmd+Shift+4</b>) 擷取畫面。';
            showConfirmModal('複製失敗', errorMessage, () => {}, true);
        }
    }, 'image/png');
}

async function exportAllToPdf() {
    if (imagesData.length === 0) {
        showConfirmModal('錯誤', '沒有圖片可導出。', () => {}, true);
        return;
    }

    showConfirmModal('正在生成 PDF', '請稍候... 正在處理所有圖片。<div class="flex justify-center mt-4"><div class="spinner"></div></div>', () => {}, true);
    
    setTimeout(async () => {
        try {
            const { jsPDF } = window.jspdf;
            const originalActiveIndex = activeImageIndex;
            let pdf;
            let firstPage = true;

            for (let i = 0; i < imagesData.length; i++) {
                activeImageIndex = i; // Temporarily switch to generate sheet

                const tempCanvas = await new Promise(resolve => {
                    generateProductSheet(true, canvas => resolve(canvas));
                });
                
                const imgData = tempCanvas.toDataURL('image/png');

                if (firstPage) {
                    pdf = new jsPDF({
                        orientation: tempCanvas.width > tempCanvas.height ? 'landscape' : 'portrait',
                        unit: 'px',
                        format: [tempCanvas.width, tempCanvas.height]
                    });
                    firstPage = false;
                } else {
                    pdf.addPage([tempCanvas.width, tempCanvas.height], tempCanvas.width > tempCanvas.height ? 'landscape' : 'portrait');
                }

                pdf.addImage(imgData, 'PNG', 0, 0, tempCanvas.width, tempCanvas.height);
            }

            activeImageIndex = originalActiveIndex; // Restore original state
            pdf.save('techpack_export.pdf');
            hideConfirmModal();
        } catch (error) {
            console.error("PDF Export Error:", error);
            hideConfirmModal();
            showConfirmModal('錯誤', `生成 PDF 時發生錯誤: ${error.message}`, () => {}, true);
        }
    }, 100);
}

// --- Gemini API Functions ---
function imageToGenerativePart(image) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = image.naturalWidth;
    tempCanvas.height = image.naturalHeight;
    tempCtx.drawImage(image, 0, 0);
    const dataUrl = tempCanvas.toDataURL("image/jpeg");
    return { inlineData: { mimeType: "image/jpeg", data: dataUrl.split(',')[1] } };
}

async function generateTechPackDescription() {
    const activeImage = getActiveImage();
    if (!activeImage) return;
    geminiLoader.style.display = 'flex';
    geminiResult.style.display = 'none';
    geminiCopyBtn.classList.add('hidden');
    geminiModal.classList.remove('hidden');
    geminiModal.classList.add('flex');
    const keywords = getActiveAnnotations().filter(a => a.type === 'arrow' || a.type === 'text' || a.type === 'pinned_zoom').map(a => a.text).join(', ');
    const systemPrompt = "你是一位專業的產品設計師助理，專門為包包、服飾或配件撰寫技術規格文件(Tech Pack)。你的任務是根據提供的產品圖片和設計師標註的關鍵字，生成一份專業、簡潔、條列式的「材質與製作說明」。內容需包含主要材質、五金配件、以及重要的製作工藝。請使用繁體中文回答。";
    const userQuery = `請為這張圖片中的產品生成一份技術規格描述。設計師標註的重點部位關鍵字如下：${keywords}`;
    const apiKey = ""; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [ { text: userQuery }, imageToGenerativePart(activeImage) ] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) { throw new Error(`API 請求失敗，狀態碼：${response.status}`); }
        const result = await response.json();
        const candidate = result.candidates?.[0];
        let text = candidate?.content?.parts?.[0]?.text;
        if (text) {
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            geminiResult.innerHTML = text;
        } else {
            geminiResult.innerHTML = '無法生成描述，請檢查 API 回應。';
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        geminiResult.innerHTML = `發生錯誤：<br><pre class="text-red-500 text-xs">${error.message}</pre>`;
    } finally {
        geminiLoader.style.display = 'none';
        geminiResult.style.display = 'block';
        geminiCopyBtn.classList.remove('hidden');
    }
}

// --- Coordinate Transformation Functions ---
const getCanvasPos = (originalPos) => {
    const activeImage = getActiveImage();
    if (!activeImage) return originalPos;
    const ratio = canvas.width / activeImage.naturalWidth;
    return { x: originalPos.x * ratio, y: originalPos.y * ratio };
};
const getOriginalPos = (canvasPos) => {
    const activeImage = getActiveImage();
    if (!activeImage) return canvasPos;
    const ratio = canvas.width / activeImage.naturalWidth;
    return { x: canvasPos.x / ratio, y: canvasPos.y / ratio };
};

// --- Multi-Image State Management ---
function getActiveImageData() {
    return activeImageIndex > -1 ? imagesData[activeImageIndex] : null;
}

function getActiveImage() {
    const data = getActiveImageData();
    return data ? data.image : null;
}

function getActiveAnnotations() {
    const data = getActiveImageData();
    return data ? data.annotations : [];
}

function setActiveImage(index) {
    if (index === activeImageIndex) return;
    activeImageIndex = index;
    renderImageTray();
    resizeCanvas();
}

function renderImageTray() {
    if (imagesData.length === 0) {
        imageTrayWrapper.classList.add('hidden');
        return;
    }
    imageTrayWrapper.classList.remove('hidden');
    imageTray.innerHTML = '';
    imagesData.forEach((data, index) => {
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'relative flex-shrink-0';
        
        const thumb = document.createElement('img');
        thumb.src = data.image.src;
        thumb.className = `thumbnail h-20 w-auto object-cover rounded-md cursor-pointer ${index === activeImageIndex ? 'active' : ''}`;
        thumb.onclick = () => setActiveImage(index);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.className = 'absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold leading-none';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteImage(index);
        };
        
        thumbWrapper.appendChild(thumb);
        thumbWrapper.appendChild(deleteBtn);
        imageTray.appendChild(thumbWrapper);
    });
}

function deleteImage(index) {
    showConfirmModal('刪除圖片', '確定要刪除這張圖片及其所有標註嗎？', () => {
        imagesData.splice(index, 1);
        if (activeImageIndex >= index) {
            activeImageIndex--;
        }
        if (activeImageIndex < 0 && imagesData.length > 0) {
            activeImageIndex = 0;
        }
        if (imagesData.length === 0) {
            activeImageIndex = -1;
        }
        setActiveImage(activeImageIndex);
        renderImageTray();
        resizeCanvas();
    });
}

// --- Annotation List Management ---

function getAnnotationText(ann) {
    if (ann.type === 'measure') {
        let displayValue = ann.value;
        if (ann.originalUnit === 'cm' && displayUnit === 'mm') displayValue *= 10;
        else if (ann.originalUnit === 'mm' && displayUnit === 'cm') displayValue /= 10;
        return `${displayValue.toFixed(1)} ${displayUnit}`;
    }
    return ann.text || '';
}

function renderAnnotationList() {
    const annotations = getActiveAnnotations();
    if (annotations.length === 0) {
        annotationListContainer.innerHTML = '<p class="text-center text-gray-500 p-4">尚未有任何註釋</p>';
        return;
    }
    annotationListContainer.innerHTML = '';

    annotations.forEach((ann, index) => {
        const item = document.createElement('div');
        item.className = 'p-2 border-b border-gray-200 flex items-center gap-2';
        
        const numberCircle = `<div class="flex-shrink-0 w-6 h-6 rounded-full text-white text-sm flex items-center justify-center font-bold" style="background-color: ${ann.color};">${index + 1}</div>`;
        
        const textContent = getAnnotationText(ann);
        const inputType = 'text'; // Always use text to show units
        
        const input = `<input type="${inputType}" value="${textContent}" class="text-sm p-1 flex-grow" data-index="${index}"/>`;
        
        const deleteBtn = `<button data-index="${index}" class="delete-ann-btn flex-shrink-0 text-gray-400 hover:text-red-500">&times;</button>`;

        item.innerHTML = numberCircle + input + deleteBtn;
        annotationListContainer.appendChild(item);
    });

    // Add event listeners after rendering
    annotationListContainer.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const ann = getActiveAnnotations()[index];
            if (ann.type === 'measure') {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) ann.value = val;
            } else {
                ann.text = e.target.value;
            }
            redraw();
        });
    });

    annotationListContainer.querySelectorAll('.delete-ann-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            getActiveAnnotations().splice(index, 1);
            redraw();
        });
    });
}


// --- Event Listeners ---
function togglePreviewMode() {
    const isPreviewing = document.body.classList.toggle('preview-mode');
    if (isPreviewing) {
        previewOverlay.appendChild(canvas);
        previewOverlay.classList.remove('hidden');
    } else {
        canvasContainer.appendChild(canvas);
        previewOverlay.classList.add('hidden');
    }
    resizeCanvas();
}

function showContextMenu(e) {
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
}


window.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if(files.length > 0) {
        handleImageUpload(files);
        e.preventDefault();
    }
});

imageLoader.addEventListener('change', (e) => handleImageUpload(e.target.files));
document.body.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if(files.length > 0) {
            handleImageUpload(files);
    }
});

measureTool.addEventListener('click', () => setActiveTool('measure'));
arrowTool.addEventListener('click', () => setActiveTool('arrow'));
textTool.addEventListener('click', () => setActiveTool('text'));
zoomAnnotationTool.addEventListener('click', () => setActiveTool('zoom_annotation'));
previewTool.addEventListener('click', togglePreviewMode);
previewOverlay.addEventListener('click', togglePreviewMode);
undoTool.addEventListener('click', () => { 
    const annotations = getActiveAnnotations();
    if (annotations.length > 0) {
        annotations.pop(); 
        redraw(); 
    }
});
unitCmBtn.addEventListener('click', () => setDisplayUnit('cm'));
unitMmBtn.addEventListener('click', () => setDisplayUnit('mm'));
clearButton.addEventListener('click', () => {
    if(activeImageIndex === -1) return;
    showConfirmModal('清除標記', '確定要清除這張圖片上的所有標記嗎？', () => {
        imagesData[activeImageIndex].annotations = [];
        redraw();
    });
});
restartButton.addEventListener('click', () => {
    showConfirmModal('重新開始', '確定要清除所有圖片和標記嗎？', () => {
        imagesData = [];
        activeImageIndex = -1;
        imageLoader.value = ''; 
        renderImageTray();
        resizeCanvas();
    });
});

lineWidth.addEventListener('input', (e) => { lineWidthValue.textContent = e.target.value; });
copyButton.addEventListener('click', (e) => generateProductSheet(false, c => copyCanvasToClipboard(e, c)) );
exportButton.addEventListener('click', () => generateProductSheet(true, exportProductSheet) );
exportPdfButton.addEventListener('click', exportAllToPdf);
geminiGenerateBtn.addEventListener('click', generateTechPackDescription);

geminiCloseBtn.addEventListener('click', () => {
        geminiModal.classList.add('hidden');
        geminiModal.classList.remove('flex');
});
geminiCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(geminiResult.innerText).then(() => {
        const originalText = geminiCopyBtn.querySelector('span').textContent;
        geminiCopyBtn.querySelector('span').textContent = '已複製!';
        setTimeout(() => { geminiCopyBtn.querySelector('span').textContent = originalText; }, 2000);
    });
});

window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undoTool.click();
            return;
        }
    }

    if (document.body.classList.contains('preview-mode') || !inputModal.classList.contains('hidden') || !confirmModal.classList.contains('hidden') || e.target.tagName === 'INPUT') {
        if(e.key === 'Escape') {
            if(document.body.classList.contains('preview-mode')) togglePreviewMode();
        }
        return;
    }
    switch (e.key.toLowerCase()) {
        case 'z': measureTool.click(); break;
        case 'v': arrowTool.click(); break;
        case 't': textTool.click(); break;
        case 'a': zoomAnnotationTool.click(); break;
    }
});

canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Ignore non-left clicks

    if (document.body.classList.contains('preview-mode')) {
        togglePreviewMode();
        return;
    }
    if (activeImageIndex === -1) return;
    
    const pos = getMousePos(e);
    
    // If a tool for creating is active, prioritize that.
    if (currentTool === 'zoom_annotation') {
        createZoomAnnotation(pos);
        return;
    }
    if (currentTool === 'text') {
        isDrawing = false;
        showInputModal('請輸入註釋文字：', '', 'text', (text) => {
            if (text) {
                getActiveAnnotations().push({ type: 'text', text, pos: getOriginalPos(pos), color: colorPicker.value, width: parseInt(lineWidth.value) });
                redraw();
            }
        });
        return;
    }

    // If no creation tool is active, check for interactions.
    const annotations = getActiveAnnotations();
    const ratio = getActiveImage() ? canvas.width / getActiveImage().naturalWidth : 1;
    
    // Check for resize handle hit on a selected annotation
    if (selectedAnnotationIndex !== -1 && annotations[selectedAnnotationIndex].type === 'pinned_zoom') {
        const handlePos = getResizeHandle(annotations[selectedAnnotationIndex], ratio);
        const dx = pos.x - handlePos.x;
        const dy = pos.y - handlePos.y;
        if (Math.sqrt(dx*dx + dy*dy) < 8 * ratio) {
            isResizing = true;
            return;
        }
    }

    // Check for selection hit on any annotation
    let hit = false;
    for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === 'pinned_zoom') {
            const canvasPos = { x: ann.pos.x * ratio, y: ann.pos.y * ratio };
            const canvasSize = ann.size * ratio;
            const dx = pos.x - canvasPos.x;
            const dy = pos.y - canvasPos.y;
            if (Math.sqrt(dx*dx + dy*dy) < canvasSize / 2) {
                selectedAnnotationIndex = i;
                hit = true;
                break;
            }
        }
    }
    
    if (hit) {
        redraw();
        return;
    }

    selectedAnnotationIndex = -1;

    // If no interaction, and it's a drawing tool, start drawing.
    if (currentTool === 'measure' || currentTool === 'arrow') {
        isDrawing = true;
        startPos = getOriginalPos(pos);
        redraw();
    }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (document.body.classList.contains('preview-mode')) return;
    showContextMenu(e);
});

canvas.addEventListener('mousemove', (e) => {
    lastMousePos = getMousePos(e);

    if (isResizing && selectedAnnotationIndex !== -1) {
        const ann = getActiveAnnotations()[selectedAnnotationIndex];
        const annCanvasPos = { x: ann.pos.x * (canvas.width / getActiveImage().naturalWidth), y: ann.pos.y * (canvas.width / getActiveImage().naturalWidth) };
        const dx = lastMousePos.x - annCanvasPos.x;
        const dy = lastMousePos.y - annCanvasPos.y;
        const newRadius = Math.sqrt(dx*dx + dy*dy);
        ann.size = (newRadius * 2) / (canvas.width / getActiveImage().naturalWidth);
        redraw();
        return;
    }


    if (!isDrawing) return;
    redraw();
    const canvasStart = getCanvasPos(startPos);
    const canvasCurrent = lastMousePos;
    ctx.beginPath();
    ctx.moveTo(canvasStart.x, canvasStart.y);
    ctx.lineTo(canvasCurrent.x, canvasCurrent.y);
    ctx.strokeStyle = colorPicker.value;
    const activeImage = getActiveImage();
    const scaledWidth = parseInt(lineWidth.value) * (activeImage ? canvas.width / activeImage.naturalWidth : 1);
    ctx.lineWidth = scaledWidth;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (currentTool === 'arrow' || currentTool === 'measure') {
        drawArrowhead(canvasStart, canvasCurrent, colorPicker.value, scaledWidth);
        if (currentTool === 'measure') {
            drawArrowhead(canvasCurrent, canvasStart, colorPicker.value, scaledWidth);
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (isResizing) {
        isResizing = false;
        return;
    }

    if (!isDrawing) return;
    isDrawing = false;
    const endPos = getOriginalPos(getMousePos(e));
    let commonProps = { start: startPos, end: endPos, color: colorPicker.value, width: parseInt(lineWidth.value) };
    if (currentTool === 'measure') {
        showInputModal(`請輸入尺寸數值 (${displayUnit}):`, '', 'number', (valueStr) => {
            const value = parseFloat(valueStr);
            if (valueStr && !isNaN(value)) {
                getActiveAnnotations().push({ ...commonProps, type: 'measure', value: value, originalUnit: displayUnit });
            }
            redraw();
        });
    } else if (currentTool === 'arrow') {
        showInputModal('請輸入標註文字:', '', 'text', (text) => {
            if (text) {
                getActiveAnnotations().push({ ...commonProps, type: 'arrow', text: text });
            }
            redraw();
        });
    } else { redraw(); }
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing) { isDrawing = false; redraw(); }
    if (isResizing) { isResizing = false; redraw(); }
});

canvas.addEventListener('wheel', (e) => {
    if (selectedAnnotationIndex !== -1) {
            const ann = getActiveAnnotations()[selectedAnnotationIndex];
            if(ann.type === 'pinned_zoom') {
            e.preventDefault();
            const zoomChange = 1 - (e.deltaY > 0 ? 0.1 : -0.1);
            ann.zoom = Math.max(1, Math.min(ann.zoom * zoomChange, 10));
            redraw();
            }
    }
});

window.addEventListener('resize', resizeCanvas);

// --- Context Menu Listeners ---
window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

colorSwatches.addEventListener('click', (e) => {
    if (e.target.dataset.color) {
        colorPicker.value = e.target.dataset.color;
        hideContextMenu();
    }
});

contextCopyBtn.addEventListener('click', (e) => {
    generateProductSheet(false, c => copyCanvasToClipboard(e, c));
    hideContextMenu();
});

// --- Helper for Pinned Zoom ---
function getResizeHandle(ann, ratio) {
    const canvasPos = {x: ann.pos.x * ratio, y: ann.pos.y * ratio};
    const canvasRadius = (ann.size / 2) * ratio;
    const angle = Math.PI / 4; // 45 degrees for bottom-right
    return {
        x: canvasPos.x + canvasRadius * Math.cos(angle),
        y: canvasPos.y + canvasRadius * Math.sin(angle)
    };
}


// --- Initialization ---
setActiveTool('measure');
setDisplayUnit('cm');
resizeCanvas();