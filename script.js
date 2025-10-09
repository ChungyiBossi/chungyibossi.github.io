// script.js

/**
 * =================================================================
 * 核心應用程式狀態管理
 * =================================================================
 */
const state = {
    // Canvas 相關
    canvas: null,
    ctx: null,
    // 圖片管理
    images: [], // { id, url, name, annotations: [] }
    currentImageIndex: -1,
    // 工具狀態
    currentTool: 'select-tool', // 預設為 'select-tool'
    // 繪圖設定
    color: '#FF0000',
    lineWidth: 3,
    unit: 'cm',
    scale: 100, // Pixel per Unit (e.g., 100 pixels = 1 cm)
    // 選取/編輯狀態
    selectedAnnotation: null,
    // 拖曳狀態 (用於移動標註或平移畫布)
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 }, // 用於平移畫布 (Pan)
};

/**
 * =================================================================
 * CanvasManager 類別：處理畫布上的所有繪圖和互動
 * =================================================================
 */
class CanvasManager {
    constructor(canvas, imageDisplayWrapper) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.imageDisplayWrapper = imageDisplayWrapper;

        // 縮放和平移 (Pan/Zoom) 狀態
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;

        // 臨時繪圖狀態 (用於正在繪製中的標註)
        this.drawing = false;
        this.tempAnnotation = null;

        this.setupEventListeners();
    }

    // 獲取當前圖片的標註列表
    get annotations() {
        if (state.currentImageIndex === -1) return [];
        return state.images[state.currentImageIndex].annotations;
    }

    // 設定事件監聽
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this)); // 滾輪縮放
    }

    // 處理滑鼠點擊事件
    handleMouseDown(e) {
        e.preventDefault();
        const { x, y } = this.getCanvasCoords(e);

        if (state.currentTool === 'select-tool') {
            this.drawing = false;
            const clickedAnnotation = this.getAnnotationAt(x, y);

            if (clickedAnnotation) {
                // 選取標註，準備移動或調整
                state.selectedAnnotation = clickedAnnotation;
                state.isDragging = true;
                state.dragStart = { x, y };
                this.redraw();
            } else {
                // 平移畫布
                state.selectedAnnotation = null;
                state.isDragging = true;
                state.dragStart = { x: e.clientX, y: e.clientY };
                state.dragOffset = { x: this.panX, y: this.panY };
                this.redraw();
            }
        } else {
            // 開始繪製新的標註
            this.drawing = true;
            state.isDragging = false;
            state.selectedAnnotation = null;
            this.startNewAnnotation(x, y);
        }
    }

    // 處理滑鼠移動事件
    handleMouseMove(e) {
        if (state.currentImageIndex === -1) return;
        const { x, y } = this.getCanvasCoords(e);

        if (state.isDragging) {
            if (state.selectedAnnotation) {
                // 移動選定的標註
                this.moveSelectedAnnotation(x, y);
            } else {
                // 平移畫布
                this.panCanvas(e.clientX, e.clientY);
            }
        } else if (this.drawing && this.tempAnnotation) {
            // 繪製中的標註
            this.updateDrawingAnnotation(x, y);
        } else if (state.currentTool === 'select-tool') {
            // 變更鼠標樣式
            const hoverAnnotation = this.getAnnotationAt(x, y);
            this.canvas.style.cursor = hoverAnnotation ? 'move' : 'grab';
        }
    }

    // 處理滑鼠釋放事件
    handleMouseUp(e) {
        if (state.currentImageIndex === -1) return;
        state.isDragging = false;
        
        if (this.drawing && this.tempAnnotation) {
            this.finishDrawing();
        }

        // 在釋放後取消移動狀態，但保持 selectedAnnotation 狀態，直到點擊別處
        // state.selectedAnnotation = null; 
    }
    
    // 處理右鍵菜單
    handleContextMenu(e) {
        e.preventDefault();
        const { x, y } = this.getCanvasCoords(e);
        const clickedAnnotation = this.getAnnotationAt(x, y);
        const contextMenu = document.getElementById('context-menu');
        const contextDelete = document.getElementById('context-delete');
        const contextEdit = document.getElementById('context-edit');

        if (clickedAnnotation) {
            state.selectedAnnotation = clickedAnnotation;
            this.redraw();
            
            // 顯示右鍵菜單
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.classList.remove('hidden');

            // 設定刪除功能
            contextDelete.onclick = () => {
                this.deleteAnnotation(state.selectedAnnotation.id);
                contextMenu.classList.add('hidden');
                state.selectedAnnotation = null;
            };

            // 設定編輯功能 (只對 Text 或 Zoom Annotation 顯示)
            const isEditable = ['text', 'zoom-annotation'].includes(clickedAnnotation.type);
            contextEdit.style.display = isEditable ? 'block' : 'none';
            if (isEditable) {
                contextEdit.onclick = () => {
                    if (clickedAnnotation.type === 'text') {
                        this.startTextEdit(clickedAnnotation);
                    } else if (clickedAnnotation.type === 'zoom-annotation') {
                         alert('放大註釋的編輯將在畫布上直接操作。');
                    }
                    contextMenu.classList.add('hidden');
                };
            }
            
        } else {
            contextMenu.classList.add('hidden');
        }

        // 點擊畫布上的其他地方隱藏菜單
        const hideMenu = (event) => {
            if (!contextMenu.contains(event.target)) {
                 contextMenu.classList.add('hidden');
                 document.removeEventListener('mousedown', hideMenu);
            }
        };
        document.addEventListener('mousedown', hideMenu);
    }
    
    // 處理滾輪縮放
    handleWheel(e) {
        e.preventDefault();
        const scaleFactor = 1.1;
        const oldZoom = this.zoomLevel;
        
        // 根據滾輪方向調整縮放等級
        if (e.deltaY < 0) {
            this.zoomLevel *= scaleFactor; // 放大
        } else {
            this.zoomLevel /= scaleFactor; // 縮小
        }
        
        // 限制最小縮放，避免過度縮小
        this.zoomLevel = Math.max(0.1, this.zoomLevel);

        // 實現以鼠標為中心的縮放
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const deltaRatio = 1 / oldZoom - 1 / this.zoomLevel;

        this.panX += mouseX * deltaRatio;
        this.panY += mouseY * deltaRatio;

        this.redraw();
    }
    
    // 平移畫布
    panCanvas(clientX, clientY) {
        const dx = clientX - state.dragStart.x;
        const dy = clientY - state.dragStart.y;
        this.panX = state.dragOffset.x + dx;
        this.panY = state.dragOffset.y + dy;
        this.redraw();
    }


    // --- 標註繪製與操作 ---

    // 取得畫布上的座標 (考慮平移和縮放)
    // CanvasManager 類別內部
    getCanvasCoords(e) {
        // 獲取 Canvas 元素相對於視口的位置和尺寸
        const rect = this.canvas.getBoundingClientRect();
        
        // 獲取滑鼠點擊的絕對視口座標
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // 步驟 1: 計算點擊點相對於 Canvas 左上角的偏移 (未縮放和平移)
        // clientX - rect.left 得到的是滑鼠在 Canvas 邊界內的 X 像素距離
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;

        // 步驟 2: 應用逆運算 (先去除平移，再去除縮放)
        // 原始圖片 X 座標 = (相對 Canvas 偏移 - 畫布的平移量) / 縮放量
        const x = (relativeX - this.panX) / this.zoomLevel;
        const y = (relativeY - this.panY) / this.zoomLevel;
        
        return { x, y };
    }

    // 根據當前工具開始新標註
    startNewAnnotation(x, y) {
        const type = state.currentTool.replace('-tool', '');
        const id = Date.now();
        
        switch (type) {
            case 'measure':
            case 'arrow':
                this.tempAnnotation = { 
                    id, type, 
                    color: state.color, 
                    lineWidth: state.lineWidth,
                    start: { x, y }, 
                    end: { x, y } 
                };
                break;
            case 'text':
                // Text tool 立即完成繪製，並開始編輯
                this.tempAnnotation = { 
                    id, type, 
                    color: state.color, 
                    lineWidth: state.lineWidth, // 用於文字大小
                    x, y, 
                    text: '新註釋' 
                };
                this.finishDrawing();
                this.startTextEdit(this.annotations[this.annotations.length - 1]);
                break;
            case 'zoom-annotation':
                 this.tempAnnotation = { 
                    id, type, 
                    color: state.color, 
                    lineWidth: state.lineWidth,
                    x: x, y: y, // 中心點
                    radius: 50, // 初始放大圓半徑
                    zoomX: x + 100, zoomY: y + 100, // 初始放大圖位置
                    zoomRadius: 40 // 放大圖半徑
                };
                break;
            default:
                this.drawing = false;
                this.tempAnnotation = null;
                break;
        }
    }

    // 更新繪製中的標註
    updateDrawingAnnotation(x, y) {
        if (!this.tempAnnotation) return;

        const type = this.tempAnnotation.type;

        if (type === 'measure' || type === 'arrow') {
            this.tempAnnotation.end.x = x;
            this.tempAnnotation.end.y = y;
        } else if (type === 'zoom-annotation') {
            // 放大註釋在拖曳時，可以調整中心點或放大圖位置
            // 為了簡化，這裡假設拖曳改變中心點位置
            const dx = x - this.tempAnnotation.x;
            const dy = y - this.tempAnnotation.y;
            this.tempAnnotation.x = x;
            this.tempAnnotation.y = y;
            // 保持放大圖的相對位置
            this.tempAnnotation.zoomX += dx;
            this.tempAnnotation.zoomY += dy;
        }
        
        this.redraw();
    }

    // 完成繪製
    finishDrawing() {
        this.drawing = false;
        if (this.tempAnnotation) {
            this.annotations.push(this.tempAnnotation);
            state.selectedAnnotation = this.tempAnnotation;
            this.tempAnnotation = null;
            this.redraw();
            this.updateAnnotationList();
        }
    }

    // 移動選定的標註
    moveSelectedAnnotation(x, y) {
        if (!state.selectedAnnotation || !state.isDragging) return;

        const dx = x - state.dragStart.x;
        const dy = y - state.dragStart.y;
        
        const ann = state.selectedAnnotation;

        if (ann.type === 'measure' || ann.type === 'arrow') {
            ann.start.x += dx;
            ann.start.y += dy;
            ann.end.x += dx;
            ann.end.y += dy;
        } else if (ann.type === 'text') {
            ann.x += dx;
            ann.y += dy;
        } else if (ann.type === 'zoom-annotation') {
            ann.x += dx;
            ann.y += dy;
            ann.zoomX += dx;
            ann.zoomY += dy;
        }
        
        state.dragStart = { x, y }; // 更新拖曳起點
        this.redraw();
        this.updateAnnotationList();
    }
    
    // 獲取位於指定座標的標註
    getAnnotationAt(x, y) {
        // 優先檢查選中的標註是否被點擊 (例如, 點擊一個測量線上的點)
        if (state.selectedAnnotation) {
            // ... 可以加入對選中標註編輯點的偵測邏輯 ...
        }

        // 檢查所有標註
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            const tolerance = 10 / this.zoomLevel; // 點擊容忍度 (考慮縮放)

            if (ann.type === 'measure' || ann.type === 'arrow') {
                // 線段點擊偵測 (簡化為檢查線段兩端點附近)
                if (this.isPointNear(x, y, ann.start.x, ann.start.y, tolerance) ||
                    this.isPointNear(x, y, ann.end.x, ann.end.y, tolerance)) {
                    return ann;
                }
            } else if (ann.type === 'text') {
                // 文字點擊偵測 (簡化為檢查文字位置附近)
                if (this.isPointNear(x, y, ann.x, ann.y, 15 / this.zoomLevel)) {
                    return ann;
                }
            } else if (ann.type === 'zoom-annotation') {
                // 放大註釋點擊偵測 (檢查中心圓或放大圓附近)
                 if (this.isPointNear(x, y, ann.x, ann.y, ann.radius / this.zoomLevel) ||
                     this.isPointNear(x, y, ann.zoomX, ann.zoomY, ann.zoomRadius / this.zoomLevel)) {
                    return ann;
                }
            }
        }
        return null;
    }
    
    // 判斷 (x, y) 是否在 (cx, cy) 附近
    isPointNear(x, y, cx, cy, tolerance) {
        return Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2)) < tolerance;
    }

    // 繪製單個標註
    drawAnnotation(ann, isTemporary = false) {
        this.ctx.save();
        this.ctx.strokeStyle = ann.color || state.color;
        this.ctx.fillStyle = ann.color || state.color;
        this.ctx.lineWidth = (ann.lineWidth || state.lineWidth) / this.zoomLevel;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const isSelected = state.selectedAnnotation && state.selectedAnnotation.id === ann.id;
        
        if (isSelected) {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = ann.color;
            this.ctx.strokeStyle = '#3b82f6'; // 選中時使用藍色
            this.ctx.fillStyle = '#3b82f6';
        }

        switch (ann.type) {
            case 'measure':
                this.drawMeasure(ann);
                break;
            case 'arrow':
                this.drawArrow(ann);
                break;
            case 'text':
                this.drawText(ann);
                break;
            case 'zoom-annotation':
                this.drawZoomAnnotation(ann);
                break;
        }

        this.ctx.restore();
        
        // 如果是選中狀態，繪製控制點
        if (isSelected) {
            this.drawSelectionHandles(ann);
        }
    }
    
    // 繪製測量標註
    drawMeasure(ann) {
        const { start, end } = ann;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        const unitLength = (length / state.scale).toFixed(2);
        const text = `${unitLength} ${state.unit}`;
        
        // 繪製主線
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        // 繪製引線 (簡化)
        const lineOffset = 15 / this.zoomLevel;
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle + Math.PI / 2;
        
        const offsetDx = Math.cos(perpAngle) * lineOffset;
        const offsetDy = Math.sin(perpAngle) * lineOffset;
        
        this.ctx.beginPath();
        this.ctx.moveTo(start.x + offsetDx, start.y + offsetDy);
        this.ctx.lineTo(start.x - offsetDx, start.y - offsetDy);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(end.x + offsetDx, end.y + offsetDy);
        this.ctx.lineTo(end.x - offsetDx, end.y - offsetDy);
        this.ctx.stroke();


        // 繪製文字
        this.ctx.font = `${14 / this.zoomLevel}px Noto Sans TC`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const textX = start.x + dx / 2;
        const textY = start.y + dy / 2 + (lineOffset * 1.5);
        
        // 文字背景 (為了清晰度)
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.fillRect(textX - this.ctx.measureText(text).width / 2 - 5, textY - 10, this.ctx.measureText(text).width + 10, 20);
        this.ctx.restore();

        this.ctx.fillStyle = ann.color || state.color;
        this.ctx.fillText(text, textX, textY);
    }
    
    // 繪製箭頭標註
    drawArrow(ann) {
        const { start, end } = ann;
        const headlen = 10 / this.zoomLevel; 
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        // 繪製主線
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        // 繪製箭頭頭部
        this.ctx.beginPath();
        this.ctx.moveTo(end.x, end.y);
        this.ctx.lineTo(end.x - headlen * Math.cos(angle - Math.PI / 6), end.y - headlen * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(end.x - headlen * Math.cos(angle + Math.PI / 6), end.y - headlen * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    // 繪製文字標註
    drawText(ann) {
        this.ctx.font = `${ann.lineWidth * 4 / this.zoomLevel}px Noto Sans TC`; // 線寬用於控制文字大小
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = ann.color || state.color;
        this.ctx.fillText(ann.text || '', ann.x, ann.y);
    }
    
    // 繪製放大註釋
    drawZoomAnnotation(ann) {
        // 1. 繪製中心圓 (表示截取區域)
        this.ctx.beginPath();
        this.ctx.arc(ann.x, ann.y, ann.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 2. 繪製放大圓
        this.ctx.beginPath();
        this.ctx.arc(ann.zoomX, ann.zoomY, ann.zoomRadius, 0, Math.PI * 2);
        this.ctx.stroke();

        // 3. 繪製連接線
        this.ctx.beginPath();
        this.ctx.moveTo(ann.x, ann.y);
        this.ctx.lineTo(ann.zoomX, ann.zoomY);
        this.ctx.stroke();
        
        // 4. 繪製放大圖像 (需要將圖像的一部分繪製到放大圓內，這是最複雜的部分)
        const currentImage = state.images[state.currentImageIndex];
        if (currentImage && currentImage.img) {
            this.ctx.save();
            
            // 裁剪到放大圓
            this.ctx.beginPath();
            this.ctx.arc(ann.zoomX, ann.zoomY, ann.zoomRadius, 0, Math.PI * 2);
            this.ctx.clip();
            
            // 計算縮放係數 (例如放大 2 倍)
            const zoomFactor = 2; 
            
            // 計算源圖像中的截取區域
            const srcX = ann.x - ann.radius;
            const srcY = ann.y - ann.radius;
            const srcWidth = ann.radius * 2;
            const srcHeight = ann.radius * 2;
            
            // 計算目標畫布上的繪製區域
            const destX = ann.zoomX - ann.radius * zoomFactor;
            const destY = ann.zoomY - ann.radius * zoomFactor;
            const destWidth = ann.radius * 2 * zoomFactor;
            const destHeight = ann.radius * 2 * zoomFactor;
            
            try {
                 this.ctx.drawImage(
                    currentImage.img, 
                    srcX, srcY, srcWidth, srcHeight, // 源圖像的 (x, y, w, h)
                    destX, destY, destWidth, destHeight // 目標畫布的 (x, y, w, h)
                );
            } catch (e) {
                 console.error("無法繪製放大圖，可能圖片尚未完全載入:", e);
            }
           
            this.ctx.restore();
            
             // 重新繪製放大圓邊框，確保它在最上層
            this.ctx.beginPath();
            this.ctx.arc(ann.zoomX, ann.zoomY, ann.zoomRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    // 繪製選取/編輯控制點
    drawSelectionHandles(ann) {
         this.ctx.save();
         this.ctx.fillStyle = '#3b82f6';
         this.ctx.strokeStyle = 'white';
         this.ctx.lineWidth = 2 / this.zoomLevel;
         const handleSize = 6 / this.zoomLevel; // 繪製的半徑

        const drawHandle = (x, y) => {
             this.ctx.beginPath();
             this.ctx.arc(x, y, handleSize, 0, Math.PI * 2);
             this.ctx.fill();
             this.ctx.stroke();
        };

        if (ann.type === 'measure' || ann.type === 'arrow') {
            drawHandle(ann.start.x, ann.start.y);
            drawHandle(ann.end.x, ann.end.y);
        } else if (ann.type === 'text') {
            drawHandle(ann.x, ann.y);
        } else if (ann.type === 'zoom-annotation') {
            // 繪製兩個圓的中心點作為控制點
            drawHandle(ann.x, ann.y);
            drawHandle(ann.zoomX, ann.zoomY);
        }
         this.ctx.restore();
    }
    
    // 啟動文字編輯
    startTextEdit(ann) {
        state.selectedAnnotation = ann;
        this.redraw();
        
        const input = document.getElementById('annotation-text-input');
        
        // 根據畫布的縮放和平移來定位輸入框
        const rect = this.canvas.getBoundingClientRect();
        const canvasContainerRect = this.imageDisplayWrapper.getBoundingClientRect();
        
        // 轉換為相對於 image-display-wrapper 的位置
        const screenX = ann.x * this.zoomLevel + this.panX + rect.left - canvasContainerRect.left;
        const screenY = ann.y * this.zoomLevel + this.panY + rect.top - canvasContainerRect.top;

        input.style.left = `${screenX}px`;
        input.style.top = `${screenY}px`;
        input.value = ann.text;
        input.style.fontSize = `${ann.lineWidth * 4}px`;
        input.style.color = ann.color;
        input.classList.remove('hidden');
        input.focus();
        
        const finishEdit = () => {
             ann.text = input.value;
             input.classList.add('hidden');
             this.redraw();
             this.updateAnnotationList();
        };
        
        input.onblur = finishEdit;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit();
            }
        };
    }
    
    // 刪除標註
    deleteAnnotation(id) {
        if (state.currentImageIndex === -1) return;
        const annotations = state.images[state.currentImageIndex].annotations;
        const index = annotations.findIndex(ann => ann.id === id);
        
        if (index > -1) {
            annotations.splice(index, 1);
            if (state.selectedAnnotation && state.selectedAnnotation.id === id) {
                 state.selectedAnnotation = null;
            }
            this.redraw();
            this.updateAnnotationList();
        }
    }

    // 重繪畫布
    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const currentImage = state.images[state.currentImageIndex];
        if (!currentImage) return;

        this.ctx.save();
        
        // 應用平移和縮放
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);
        
        // 繪製背景圖片
        try {
            this.ctx.drawImage(currentImage.img, 0, 0, currentImage.img.width, currentImage.img.height);
        } catch (e) {
             console.error("無法繪製圖片:", e);
        }

        // 繪製所有標註
        this.annotations.forEach(ann => this.drawAnnotation(ann));

        // 繪製臨時標註 (如果正在繪製中)
        if (this.tempAnnotation) {
            this.drawAnnotation(this.tempAnnotation, true);
        }

        this.ctx.restore();
    }
    
    // 設定畫布尺寸並載入圖片
    setCanvasImage(imageObj) {
        state.currentImageIndex = state.images.findIndex(img => img.id === imageObj.id);
        
        this.canvas.width = imageObj.img.width;
        this.canvas.height = imageObj.img.height;
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.width = `${imageObj.img.width}px`;
        this.canvas.style.height = `${imageObj.img.height}px`;

        // 重置縮放和平移
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;
        
        // 隱藏上傳區塊
        document.getElementById('upload-container').classList.add('hidden');
        
        this.redraw();
        this.updateAnnotationList();
    }
    
    // 清除所有標記
    clearAllAnnotations() {
        if (state.currentImageIndex !== -1) {
            state.images[state.currentImageIndex].annotations = [];
            state.selectedAnnotation = null;
            this.redraw();
            this.updateAnnotationList();
        }
    }
    
    // 將畫布內容導出為圖片
    exportCanvasToBlob(callback) {
         this.canvas.toBlob(callback, 'image/png');
    }
    
    // 更新右側標註列表
    updateAnnotationList() {
        const listContainer = document.getElementById('annotation-list');
        listContainer.innerHTML = '';
        const annotations = this.annotations;

        if (annotations.length === 0) {
             document.getElementById('no-annotations-message').classList.remove('hidden');
             return;
        }

        document.getElementById('no-annotations-message').classList.add('hidden');

        annotations.forEach((ann, index) => {
            const item = document.createElement('div');
            item.className = 'flex items-center space-x-2 p-2 bg-white rounded-md shadow-sm hover:bg-gray-100 cursor-pointer transition-colors';
            item.dataset.id = ann.id;
            
            const typeDisplay = ann.type === 'measure' ? '測量' : 
                                ann.type === 'arrow' ? '箭頭' : 
                                ann.type === 'text' ? '註釋' : 
                                ann.type === 'zoom-annotation' ? '放大' : '未知';
            
            let content = '';
            if (ann.type === 'measure') {
                 // 這裡需要重新計算長度
                const dx = ann.end.x - ann.start.x;
                const dy = ann.end.y - ann.start.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const unitLength = (length / state.scale).toFixed(2);
                content = `${unitLength} ${state.unit}`;
            } else if (ann.type === 'text') {
                content = ann.text;
            } else if (ann.type === 'zoom-annotation') {
                content = `中心 (${ann.x.toFixed(0)}, ${ann.y.toFixed(0)})`;
            } else if (ann.type === 'arrow') {
                 content = `箭頭 ${index + 1}`;
            }

            item.innerHTML = `
                <div class="w-2 h-2 rounded-full" style="background-color: ${ann.color}"></div>
                <div class="flex-grow min-w-0">
                    <p class="text-xs font-semibold text-gray-700">${typeDisplay}</p>
                    <input type="text" value="${content}" class="text-sm text-gray-600 focus:ring-blue-500 focus:border-blue-500" data-type="${ann.type}">
                </div>
                <button class="text-gray-400 hover:text-red-500 delete-annotation-btn" data-id="${ann.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;
            
            listContainer.appendChild(item);
            
            // 處理列表中的刪除按鈕
            item.querySelector('.delete-annotation-btn').addEventListener('click', (e) => {
                 e.stopPropagation();
                 this.deleteAnnotation(parseInt(e.currentTarget.dataset.id));
            });
            
            // 處理列表中的文字編輯
            const input = item.querySelector('input');
            if (ann.type === 'text') {
                 input.addEventListener('change', (e) => {
                     ann.text = e.target.value;
                     this.redraw();
                 });
            } else {
                 // 其他類型標註的輸入框只用於顯示，不能修改
                 input.readOnly = true;
            }

            // 列表項目點擊事件：選中標註
            item.addEventListener('click', () => {
                 state.selectedAnnotation = ann;
                 this.redraw();
                 // TODO: 可以加上滾動到標註位置的功能
            });
        });
    }
}


/**
 * =================================================================
 * DOM 和應用程式初始化
 * =================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const imageDisplayWrapper = document.getElementById('image-display-wrapper');
    const inputUpload = document.getElementById('image-upload-input');
    const addImageBtn = document.getElementById('add-image-btn');
    const imageTray = document.getElementById('image-thumbnails');
    const uploadContainer = document.getElementById('upload-container');
    const loadingModal = document.getElementById('loading-modal');
    const colorPicker = document.getElementById('color-picker');
    const lineWidthInput = document.getElementById('line-width');
    const lineWidthValue = document.getElementById('line-width-value');
    const unitCmBtn = document.getElementById('unit-cm');
    const unitMmBtn = document.getElementById('unit-mm');
    const scaleInput = document.getElementById('scale-input');
    const copyCanvasBtn = document.getElementById('copy-canvas');
    const previewToolBtn = document.getElementById('preview-tool');
    const previewOverlay = document.getElementById('preview-overlay');
    const clearCanvasBtn = document.getElementById('clear-canvas');
    const geminiGenerateBtn = document.getElementById('gemini-generate');
    const generatedDescription = document.getElementById('generated-description');
    const copyDescriptionBtn = document.getElementById('copy-description-btn');
    const exportBtn = document.getElementById('export-btn');

    // 實例化 CanvasManager
    const canvasManager = new CanvasManager(canvas, imageDisplayWrapper);

    // --- 初始化設定 ---
    colorPicker.value = state.color;
    lineWidthInput.value = state.lineWidth;
    lineWidthValue.textContent = state.lineWidth;
    scaleInput.value = state.scale;

    // --- 事件監聽器 ---

    // 1. 圖片上傳 (點擊按鈕)
    addImageBtn.addEventListener('click', () => inputUpload.click());
    
    // 2. 圖片上傳 (拖曳/點擊)
    const handleFiles = (files) => {
        // 1. 篩選有效的圖片檔案
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        const totalFilesToLoad = imageFiles.length;

        // 獲取 DOM 元素 (確保這些變數在外部作用域中可以被 handleFiles 存取)
        // ⚠️ 註：如果這些變數在 DOMContentLoaded 內部定義，請確保它們是可用的。
        const loadingModal = document.getElementById('loading-modal');
        const uploadContainer = document.getElementById('upload-container');
        
        // 如果沒有圖片或 DOM 元素不存在，則退出
        if (totalFilesToLoad === 0 || !loadingModal || !uploadContainer) {
            if (loadingModal) loadingModal.classList.add('hidden');
            return;
        }

        // 顯示讀取畫面
        uploadContainer.querySelector('p span').textContent = '上傳中...';
        loadingModal.classList.remove('hidden');
        
        let loadedCount = 0;

        // 核心函數：無論成功或失敗，都要推進計數器並檢查是否完成
        const checkCompletion = () => {
            loadedCount++;
            if (loadedCount === totalFilesToLoad) {
                // 確保 loadingModal 存在才操作，防止您之前遇到的 'null' 錯誤
                if (loadingModal) loadingModal.classList.add('hidden');
                if (uploadContainer) uploadContainer.classList.add('hidden');
                
                // 重設文字提示
                if (uploadContainer) {
                    uploadContainer.querySelector('p span').textContent = '點擊上傳';
                }
                
                // 確保顯示第一張圖
                if (state.images.length > 0) {
                    // 找到這批上傳的第一張圖片（假設它們是連續加入 state.images 的）
                    const firstNewImage = state.images[state.images.length - totalFilesToLoad];
                    canvasManager.setCanvasImage(firstNewImage);
                    setActiveThumbnail(firstNewImage.id);
                }
            }
        };
        
        imageFiles.forEach(file => {
            const reader = new FileReader();
            
            // 處理 FileReader 讀取檔案失敗
            reader.onerror = (e) => {
                console.error(`檔案讀取失敗 (File Reader Error): ${file.name}`);
                checkCompletion(); // ❌ 失敗，但計數器必須推進
            };

            // 處理 FileReader 載入完成
            reader.onload = (e) => {
                const img = new Image();
                
                // 處理 Image 載入失敗 (圖片損壞、格式不支援等)
                img.onerror = () => {
                    console.error(`圖片載入失敗 (Image Error): ${file.name}`);
                    checkCompletion(); // ❌ 失敗，但計數器必須推進
                };
                
                // 處理 Image 載入成功
                img.onload = () => {
                    const newImage = {
                        id: Date.now() + Math.random(),
                        url: e.target.result,
                        name: file.name,
                        img: img,
                        annotations: [] 
                    };
                    state.images.push(newImage);
                    createThumbnail(newImage);
                    
                    checkCompletion(); // ✅ 成功載入，推進計數
                };
                
                img.src = e.target.result;
            };
            
            reader.readAsDataURL(file);
        });
    };
    
    inputUpload.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        e.target.value = null; // 清空，以便再次上傳相同檔案
    });

    // 圖片拖曳上傳
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
         uploadContainer.addEventListener(eventName, (e) => {
             e.preventDefault();
             e.stopPropagation();
         }, false);
    });
    
    uploadContainer.addEventListener('drop', (e) => {
         const dt = e.dataTransfer;
         handleFiles(dt.files);
    });


    // 3. 工具列切換
    document.querySelectorAll('#toolbar button[id$="-tool"]').forEach(btn => {
        btn.addEventListener('click', () => {
            // 清除所有工具的 active 狀態
            document.querySelectorAll('#toolbar .sidebar-btn').forEach(b => b.classList.remove('active'));
            // 設定新的 active 狀態
            btn.classList.add('active');
            // 更新狀態
            state.currentTool = btn.id;
            // 取消選取狀態，準備開始新繪圖
            state.selectedAnnotation = null;
            canvasManager.redraw();
            
            // 根據工具設定鼠標
            canvas.style.cursor = (btn.id === 'select-tool') ? 'grab' : 'crosshair';
            
            // 隱藏文字輸入框
            document.getElementById('annotation-text-input').classList.add('hidden');
        });
    });

    // 4. 設定調整
    colorPicker.addEventListener('input', (e) => {
        state.color = e.target.value;
    });

    lineWidthInput.addEventListener('input', (e) => {
        state.lineWidth = parseInt(e.target.value);
        lineWidthValue.textContent = state.lineWidth;
    });

    unitCmBtn.addEventListener('click', () => setUnit('cm'));
    unitMmBtn.addEventListener('click', () => setUnit('mm'));
    
    scaleInput.addEventListener('change', (e) => {
        state.scale = parseInt(e.target.value) || 100;
        canvasManager.redraw(); // 比例尺改變，測量標註需重繪
    });

    // 5. 動作按鈕
    clearCanvasBtn.addEventListener('click', () => {
        if (confirm('確定要清除當前圖片上的所有標記嗎？')) {
            canvasManager.clearAllAnnotations();
        }
    });
    
    copyCanvasBtn.addEventListener('click', async () => {
        loadingModal.classList.remove('hidden');
        try {
            await copyCanvasToClipboard();
             showNotification('圖片已複製到剪貼簿！');
        } catch (error) {
            console.error('複製失敗:', error);
            showNotification('複製失敗，請檢查權限或瀏覽器支援！', true);
        } finally {
            loadingModal.classList.add('hidden');
        }
    });
    
    previewToolBtn.addEventListener('click', () => {
        togglePreviewMode();
    });
    
    previewOverlay.addEventListener('click', (e) => {
         // 點擊 overlay 自身才關閉
         if (e.target.id === 'preview-overlay') {
             togglePreviewMode();
         }
    });

    // 6. 導出
    exportBtn.addEventListener('click', () => {
        // 導出功能通常需要將標註數據和圖片整合
        alert('導出製單功能待實作，將導出所有圖片的標註數據 (JSON) 和標註圖片。');
        
        const exportData = state.images.map(img => ({
            name: img.name,
            annotations: img.annotations,
            settings: { color: state.color, lineWidth: state.lineWidth, unit: state.unit, scale: state.scale }
        }));
        
        console.log('導出數據:', exportData);
        // 實務上會呼叫後端 API 進行處理或下載 JSON 文件
        downloadJSON(exportData, 'technical-specs-export.json');
    });

    // 7. AI 整合 (模擬)
    geminiGenerateBtn.addEventListener('click', () => {
        generateDescription();
    });
    
    copyDescriptionBtn.addEventListener('click', () => {
         copyToClipboard(generatedDescription.value);
         showNotification('規格描述已複製！');
    });

    // --- 輔助函數 ---

    function setUnit(newUnit) {
        state.unit = newUnit;
        unitCmBtn.classList.remove('bg-blue-500', 'text-white');
        unitMmBtn.classList.remove('bg-blue-500', 'text-white');
        unitCmBtn.classList.remove('text-gray-700');
        unitMmBtn.classList.remove('text-gray-700');

        if (newUnit === 'cm') {
            unitCmBtn.classList.add('bg-blue-500', 'text-white');
            unitMmBtn.classList.add('text-gray-700');
        } else {
            unitMmBtn.classList.add('bg-blue-500', 'text-white');
            unitCmBtn.classList.add('text-gray-700');
        }
        canvasManager.redraw(); // 單位改變，測量標註需重繪
    }
    
    function createThumbnail(imageObj) {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail flex-shrink-0 w-20 h-20 p-1 bg-white rounded-lg shadow-md cursor-pointer';
        wrapper.dataset.id = imageObj.id;
        
        const img = document.createElement('img');
        img.src = imageObj.url;
        img.alt = imageObj.name;
        img.className = 'w-full h-full object-contain rounded-md';
        
        wrapper.appendChild(img);
        imageTray.appendChild(wrapper);
        
        wrapper.addEventListener('click', () => {
            canvasManager.setCanvasImage(imageObj);
            setActiveThumbnail(imageObj.id);
        });
        
        // 刪除按鈕 (可選：長按或右鍵菜單添加)
        
    }
    
    function setActiveThumbnail(id) {
        document.querySelectorAll('.thumbnail').forEach(thumb => {
            if (parseInt(thumb.dataset.id) === id) {
                thumb.classList.add('active');
            } else {
                thumb.classList.remove('active');
            }
        });
    }

    // 模擬 AI 生成描述
    async function generateDescription() {
        loadingModal.classList.remove('hidden');
        generatedDescription.value = '正在呼叫 AI 產生描述...';
        
        // 收集所有圖片的所有標註數據
        const allAnnotations = state.images.flatMap(img => ({
            imageName: img.name,
            annotations: img.annotations.map(ann => {
                if (ann.type === 'measure') {
                    const dx = ann.end.x - ann.start.x;
                    const dy = ann.end.y - ann.start.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const unitLength = (length / state.scale).toFixed(2);
                    return `【測量】 尺寸: ${unitLength} ${state.unit}`;
                }
                if (ann.type === 'text') {
                    return `【註釋】 內容: ${ann.text}`;
                }
                if (ann.type === 'zoom-annotation') {
                     return `【放大】 區域在 (${ann.x.toFixed(0)}, ${ann.y.toFixed(0)}) 處有細節放大。`;
                }
                if (ann.type === 'arrow') {
                     return `【箭頭】 指向特定位置的箭頭標記。`;
                }
                return `【${ann.type}】`;
            })
        }));
        
        const annotationString = JSON.stringify(allAnnotations, null, 2);
        
        // --- 這裡將是呼叫 Gemini API 的部分 ---
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 模擬 API 延遲
        
        const mockResponse = `
        產品規格描述 (AI 生成)

        基於圖片標註的綜合分析:

        1.  **結構與尺寸**：
            -   主體尺寸已標註，最大測量值為 ${allAnnotations.filter(a => a.annotations.some(s => s.startsWith('【測量】'))).length > 0 ? '從標註中提取的尺寸' : '未發現明確尺寸標註'}。
            -   所有測量單位均設定為 ${state.unit}，轉換比例為 1:${state.scale} Pixel/Unit。

        2.  **關鍵細節與說明**：
            -   發現 ${allAnnotations.filter(a => a.annotations.some(s => s.startsWith('【放大】'))).length} 個放大註釋，集中於產品邊緣和連接點。
            -   文字註釋內容概覽：
                ${allAnnotations.flatMap(a => a.annotations).filter(s => s.startsWith('【註釋】')).map(s => `    - ${s.replace('【註釋】 內容: ', '')}`).join('\n')}

        3.  **建議**：
            -   請核對放大區域的細節圖，確保特定工藝要求被記錄。
            -   確認所有箭頭標註 (共 ${allAnnotations.flatMap(a => a.annotations).filter(s => s.startsWith('【箭頭】')).length} 個) 的意圖。
        `;
        
        generatedDescription.value = mockResponse;
        loadingModal.classList.add('hidden');
    }

    function showNotification(message, isError = false) {
        const notif = document.getElementById('copy-notification');
        notif.textContent = message;
        notif.style.backgroundColor = isError ? '#ef4444' : '#10b981';
        notif.classList.remove('hidden');
        setTimeout(() => {
            notif.classList.add('hidden');
        }, 3000);
    }

    uploadContainer.addEventListener('click', (e) => {
        // 檢查點擊目標，防止誤觸
        // 如果點擊目標不是上傳容器本身或其子元素，可以進一步優化
        // 這裡我們直接觸發隱藏的檔案輸入框
        if (state.currentImageIndex === -1 && !loadingModal.classList.contains('hidden')) {
            // 確保只有在沒有圖片且沒有加載時才觸發
            return;
        }
        inputUpload.click();
    });

    async function copyCanvasToClipboard() {
        if (state.currentImageIndex === -1) {
             throw new Error("沒有圖片可以複製");
        }
        
        return new Promise((resolve, reject) => {
            canvasManager.exportCanvasToBlob((blob) => {
                if (!blob) {
                    return reject(new Error("畫布轉換為 Blob 失敗"));
                }
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(resolve, reject);
            });
        });
    }

    function copyToClipboard(text) {
         navigator.clipboard.writeText(text).catch(err => {
             console.error('無法複製文本:', err);
             // 備用複製方法 (如果 navigator.clipboard 不可用)
             const tempInput = document.createElement('textarea');
             tempInput.value = text;
             document.body.appendChild(tempInput);
             tempInput.select();
             document.execCommand('copy');
             document.body.removeChild(tempInput);
         });
    }

    function togglePreviewMode() {
        const currentImage = state.images[state.currentImageIndex];
        if (!currentImage) return;

        const isPreviewing = document.body.classList.toggle('preview-mode');

        if (isPreviewing) {
            // 進入預覽模式
            previewOverlay.classList.remove('hidden');
            previewToolBtn.classList.add('active');
            
            const previewCanvas = document.getElementById('preview-canvas');
            // 確保預覽畫布與主畫布尺寸相同
            previewCanvas.width = canvas.width;
            previewCanvas.height = canvas.height;
            
            // 繪製完整的標註圖到預覽畫布
            const ctx = previewCanvas.getContext('2d');
            
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            
            // 由於預覽模式會應用 CSS 的 object-fit: contain，
            // 這裡只需要繪製一個乾淨的、沒有 Pan/Zoom 的標註版本。
            
            ctx.drawImage(currentImage.img, 0, 0, currentImage.img.width, currentImage.img.height);
            
            currentImage.annotations.forEach(ann => {
                // 暫時將 canvasManager 的 zoom/pan 設為 1/0 來繪製
                const originalZoom = canvasManager.zoomLevel;
                const originalPanX = canvasManager.panX;
                const originalPanY = canvasManager.panY;
                canvasManager.zoomLevel = 1.0;
                canvasManager.panX = 0;
                canvasManager.panY = 0;
                
                // 使用臨時的上下文來繪製標註
                const originalCtx = canvasManager.ctx;
                canvasManager.ctx = ctx; 
                canvasManager.drawAnnotation(ann);
                
                // 恢復上下文和狀態
                canvasManager.ctx = originalCtx;
                canvasManager.zoomLevel = originalZoom;
                canvasManager.panX = originalPanX;
                canvasManager.panY = originalPanY;
            });
            
        } else {
            // 退出預覽模式
            previewOverlay.classList.add('hidden');
            previewToolBtn.classList.remove('active');
        }
    }
    
    function downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }


    // --- 快捷鍵設定 ---
    document.addEventListener('keydown', (e) => {
        // 忽略輸入框中的按鍵
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        let toolId = '';
        if (e.key === 'z' || e.key === 'Z') toolId = 'measure-tool';
        else if (e.key === 'v' || e.key === 'V') toolId = 'arrow-tool';
        else if (e.key === 't' || e.key === 'T') toolId = 'text-tool';
        else if (e.key === 'a' || e.key === 'A') toolId = 'zoom-annotation-tool';
        else if (e.key === 's' || e.key === 'S') toolId = 'select-tool';
        else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.selectedAnnotation) {
                e.preventDefault();
                canvasManager.deleteAnnotation(state.selectedAnnotation.id);
            }
        }

        if (toolId) {
             e.preventDefault();
             document.getElementById(toolId).click();
        }
    });
    
    // 預設選取工具
    setUnit(state.unit);
    document.getElementById('select-tool').click();
});