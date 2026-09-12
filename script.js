"use strict";

/* =========================================================
   PeerDrop - PC
   P2P File Transfer con PeerJS
   ========================================================= */

const CHUNK_SIZE = 64 * 1024;
const PEER_ID_LENGTH = 6;
const MOBILE_PATH = "/Mobile/";

const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let peer = null;
let connection = null;
let selectedFile = null;
let pendingPeerId = null;

let incomingTransfers = {};
let receivedFiles = [];

/* =========================================================
   ELEMENTOS
   ========================================================= */

const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");

const connectionSection = document.getElementById("connectionSection");
const transferSection = document.getElementById("transferSection");

const shareLinkInput = document.getElementById("shareLinkInput");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const myIdDisplay = document.getElementById("myIdDisplay");

const connectForm = document.getElementById("connectForm");
const remoteIdInput = document.getElementById("remoteIdInput");

const connectionTarget = document.getElementById("connectionTarget");
const disconnectBtn = document.getElementById("disconnectBtn");

const dropZone = document.getElementById("dropZone");
const selectFileBtn = document.getElementById("selectFileBtn");
const fileInput = document.getElementById("fileInput");

const fileCard = document.getElementById("fileCard");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const removeFileBtn = document.getElementById("removeFileBtn");
const sendFileBtn = document.getElementById("sendFileBtn");

const progressCard = document.getElementById("progressCard");
const progressTitle = document.getElementById("progressTitle");
const progressPercent = document.getElementById("progressPercent");
const progressBar = document.getElementById("progressBar");
const progressStatus = document.getElementById("progressStatus");
const progressSpeed = document.getElementById("progressSpeed");

const receivedSection = document.getElementById("receivedSection");
const receivedFilesList = document.getElementById("receivedFilesList");
const receivedCount = document.getElementById("receivedCount");

const customModal = document.getElementById("customModal");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalConfirmBtn = document.getElementById("modalConfirmBtn");

/* =========================================================
   INICIO
   ========================================================= */

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
    setupEvents();

    pendingPeerId = getPeerIdFromHash();

    /*
     * Primero comprobamos si este dispositivo debería estar
     * usando la versión móvil.
     */
    if (redirectForDevice()) {
        return;
    }

    initializePeer();
}

/* =========================================================
   DETECCIÓN PC / MÓVIL
   ========================================================= */

function isMobileDevice() {
    return (
        /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i
            .test(navigator.userAgent)
        || window.matchMedia("(max-width: 700px)").matches
    );
}

function redirectForDevice() {
    const isMobile = isMobileDevice();
    const currentPath = window.location.pathname;

    const isMobilePage =
        currentPath === MOBILE_PATH ||
        currentPath.startsWith(MOBILE_PATH);

    /*
     * Si un móvil entra a la versión PC,
     * lo mandamos automáticamente a /Mobile/
     */
    if (isMobile && !isMobilePage) {
        const hash = window.location.hash || "";

        window.location.replace(
            `${window.location.origin}${MOBILE_PATH}${hash}`
        );

        return true;
    }

    /*
     * Si una PC entra directamente a /Mobile/,
     * vuelve a la versión PC.
     */
    if (!isMobile && isMobilePage) {
        const hash = window.location.hash || "";

        window.location.replace(
            `${window.location.origin}/${hash}`
        );

        return true;
    }

    return false;
}

/* =========================================================
   EVENTOS
   ========================================================= */

function setupEvents() {
    if (connectForm) {
        connectForm.addEventListener("submit", event => {
            event.preventDefault();

            const id = remoteIdInput.value
                .trim()
                .toUpperCase();

            connectToPeer(id);
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", copyShareLink);
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", disconnect);
    }

    if (selectFileBtn) {
        selectFileBtn.addEventListener("click", () => {
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", event => {
            const file = event.target.files?.[0];

            if (file) {
                selectFile(file);
            }
        });
    }

    if (removeFileBtn) {
        removeFileBtn.addEventListener("click", removeSelectedFile);
    }

    if (sendFileBtn) {
        sendFileBtn.addEventListener("click", sendSelectedFile);
    }

    if (dropZone) {
        dropZone.addEventListener("dragover", event => {
            event.preventDefault();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", event => {
            event.preventDefault();

            dropZone.classList.remove("drag-over");

            const file = event.dataTransfer.files?.[0];

            if (file) {
                selectFile(file);
            }
        });
    }

    window.addEventListener("hashchange", handleHashChange);

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener("click", closeModal);
    }
}

/* =========================================================
   PEERJS
   ========================================================= */

function initializePeer() {
    setStatus("connecting", "Conectando...");

    const shortId = generateShortPeerId();

    try {
        peer = new Peer(shortId, {
            debug: 0
        });
    } catch (error) {
        console.error("Error creando Peer:", error);

        setStatus("error", "Error");

        showModal(
            "⚠️",
            "No se pudo iniciar PeerDrop",
            "No fue posible iniciar la conexión P2P."
        );

        return;
    }

    peer.on("open", id => {
        console.log("Peer abierto:", id);

        myIdDisplay.textContent = id;

        shareLinkInput.value = generateShareLink(id);
        copyLinkBtn.disabled = false;

        setStatus("connected", "Listo");

        /*
         * Si entramos mediante #ID, esperamos a que PeerJS
         * esté completamente abierto antes de conectar.
         */
        if (pendingPeerId && !connection) {
            const targetId = pendingPeerId;

            pendingPeerId = null;

            setTimeout(() => {
                connectToPeer(targetId, true);
            }, 100);
        }
    });

    peer.on("connection", incomingConnection => {
        console.log(
            "Conexión entrante desde:",
            incomingConnection.peer
        );

        if (connection) {
            try {
                incomingConnection.close();
            } catch {}

            return;
        }

        setupConnection(incomingConnection);
    });

    peer.on("error", error => {
        console.error("PeerJS error:", error);

        if (error.type === "unavailable-id") {
            console.warn("ID ocupado. Generando otro...");

            try {
                peer.destroy();
            } catch {}

            peer = null;

            setTimeout(() => {
                initializePeer();
            }, 150);

            return;
        }

        if (error.type === "peer-unavailable") {
            setStatus("error", "No encontrado");

            showModal(
                "⚠️",
                "Dispositivo no encontrado",
                "No se pudo encontrar el código introducido."
            );

            return;
        }

        if (error.type === "network") {
            setStatus("error", "Error de red");

            showModal(
                "⚠️",
                "Error de conexión",
                "No se pudo establecer la conexión con el servidor de señalización."
            );

            return;
        }

        setStatus("error", "Error");
    });

    peer.on("disconnected", () => {
        console.warn("Peer desconectado");

        if (!connection) {
            setStatus("connecting", "Reconectando...");

            try {
                peer.reconnect();
            } catch {}
        }
    });

    peer.on("close", () => {
        console.log("Peer cerrado");
    });
}

/* =========================================================
   IDS
   ========================================================= */

function generateShortPeerId() {
    let id = "";

    for (let i = 0; i < PEER_ID_LENGTH; i++) {
        const randomIndex =
            Math.floor(Math.random() * characters.length);

        id += characters[randomIndex];
    }

    return id;
}

function getPeerIdFromHash() {
    const hash = window.location.hash.replace(/^#/, "").trim();

    if (!hash) {
        return null;
    }

    try {
        return decodeURIComponent(hash)
            .trim()
            .toUpperCase();
    } catch {
        return hash.toUpperCase();
    }
}

/* =========================================================
   LINKS
   ========================================================= */

function generateShareLink(id) {
    const url = new URL(window.location.href);

    url.hash = encodeURIComponent(id);

    return url.toString();
}

async function copyShareLink() {
    if (!shareLinkInput?.value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(
            shareLinkInput.value
        );

        const originalText = copyLinkBtn.textContent;

        copyLinkBtn.textContent = "Copiado";

        setTimeout(() => {
            copyLinkBtn.textContent = originalText;
        }, 1500);

    } catch (error) {
        shareLinkInput.select();

        document.execCommand("copy");

        showModal(
            "✓",
            "Enlace copiado",
            "El enlace fue copiado al portapapeles."
        );
    }
}

/* =========================================================
   CONEXIÓN
   ========================================================= */

function connectToPeer(id, fromDirectLink = false) {
    if (!id) {
        showModal(
            "⚠️",
            "Código vacío",
            "Introduce el código del dispositivo al que quieres conectarte."
        );

        return;
    }

    id = id.trim().toUpperCase();

    if (!peer) {
        pendingPeerId = id;
        return;
    }

    if (!peer.open) {
        pendingPeerId = id;
        return;
    }

    if (id.length !== PEER_ID_LENGTH) {
        showModal(
            "⚠️",
            "Código inválido",
            `El código debe tener ${PEER_ID_LENGTH} caracteres.`
        );

        return;
    }

    if (id === peer.id) {
        showModal(
            "⚠️",
            "Código inválido",
            "No puedes conectarte a tu propio dispositivo."
        );

        return;
    }

    if (connection) {
        try {
            connection.close();
        } catch {}

        connection = null;
    }

    setStatus("connecting", "Conectando...");

    connectionTarget.textContent =
        `Conectando con ${id}...`;

    try {
        const newConnection = peer.connect(id, {
            reliable: true
        });

        setupConnection(newConnection);

    } catch (error) {
        console.error(error);

        setStatus("error", "Error");

        showModal(
            "⚠️",
            "No se pudo conectar",
            "Ocurrió un error al intentar establecer la conexión."
        );
    }
}

function setupConnection(conn) {
    connection = conn;

    conn.on("open", () => {
        console.log("Conexión abierta con:", conn.peer);

        connectionTarget.textContent =
            `Conectado con ${conn.peer}`;

        setStatus("connected", "Conectado");

        if (connectionSection) {
            connectionSection.classList.add("hidden");
        }

        if (transferSection) {
            transferSection.classList.remove("hidden");
        }

        /*
         * Quitamos el código del hash después de conectarnos
         * para que no intente reconectar al recargar.
         */
        if (window.location.hash) {
            history.replaceState(
                null,
                "",
                window.location.pathname +
                window.location.search
            );
        }
    });

    conn.on("data", handleIncomingData);

    conn.on("close", () => {
        console.log("Conexión cerrada");

        connection = null;

        setStatus("connected", "Listo");

        if (connectionSection) {
            connectionSection.classList.remove("hidden");
        }

        if (transferSection) {
            transferSection.classList.add("hidden");
        }

        connectionTarget.textContent = "Sin conexión";

        resetProgress();

        showModal(
            "ℹ️",
            "Conexión cerrada",
            "La conexión con el otro dispositivo se cerró."
        );
    });

    conn.on("error", error => {
        console.error("Connection error:", error);

        connection = null;

        setStatus("error", "Error de conexión");

        if (connectionSection) {
            connectionSection.classList.remove("hidden");
        }

        if (transferSection) {
            transferSection.classList.add("hidden");
        }
    });
}

function disconnect() {
    if (connection) {
        try {
            connection.close();
        } catch {}
    }

    connection = null;

    if (connectionSection) {
        connectionSection.classList.remove("hidden");
    }

    if (transferSection) {
        transferSection.classList.add("hidden");
    }

    connectionTarget.textContent = "Sin conexión";

    setStatus("connected", "Listo");

    resetProgress();
}

/* =========================================================
   HASH / LINK DIRECTO
   ========================================================= */

function handleHashChange() {
    const id = getPeerIdFromHash();

    if (!id) {
        return;
    }

    if (!peer || !peer.open) {
        pendingPeerId = id;
        return;
    }

    if (connection) {
        return;
    }

    pendingPeerId = null;

    connectToPeer(id, true);
}

/* =========================================================
   ARCHIVOS
   ========================================================= */

function selectFile(file) {
    selectedFile = file;

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    fileCard.classList.remove("hidden");

    sendFileBtn.disabled = !connection;
}

function removeSelectedFile() {
    selectedFile = null;

    if (fileInput) {
        fileInput.value = "";
    }

    fileCard.classList.add("hidden");

    sendFileBtn.disabled = true;
}

async function sendSelectedFile() {
    if (!selectedFile) {
        return;
    }

    if (!connection || !connection.open) {
        showModal(
            "⚠️",
            "Sin conexión",
            "Primero debes conectarte con otro dispositivo."
        );

        return;
    }

    const file = selectedFile;

    sendFileBtn.disabled = true;
    removeFileBtn.disabled = true;

    progressCard.classList.remove("hidden");

    progressTitle.textContent =
        `Enviando ${file.name}`;

    progressStatus.textContent =
        "Preparando archivo...";

    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    progressSpeed.textContent = "";

    const totalChunks =
        Math.ceil(file.size / CHUNK_SIZE);

    let offset = 0;
    let chunkIndex = 0;

    const startTime = performance.now();

    try {
        connection.send({
            type: "file-start",
            name: file.name,
            size: file.size,
            mime: file.type || "application/octet-stream",
            totalChunks
        });

        while (offset < file.size) {
            const chunk = file.slice(
                offset,
                offset + CHUNK_SIZE
            );

            const buffer = await chunk.arrayBuffer();

            connection.send({
                type: "file-chunk",
                index: chunkIndex,
                data: buffer
            });

            offset += chunk.size;
            chunkIndex++;

            const percent =
                file.size === 0
                    ? 100
                    : Math.round((offset / file.size) * 100);

            const elapsed =
                (performance.now() - startTime) / 1000;

            const speed =
                elapsed > 0
                    ? offset / elapsed
                    : 0;

            progressPercent.textContent =
                `${percent}%`;

            progressBar.style.width =
                `${percent}%`;

            progressStatus.textContent =
                `${formatFileSize(offset)} / ${formatFileSize(file.size)}`;

            progressSpeed.textContent =
                `${formatFileSize(speed)}/s`;

            /*
             * Le damos al navegador un momento para procesar
             * los eventos y evitar bloquear la interfaz.
             */
            await new Promise(resolve =>
                setTimeout(resolve, 0)
            );
        }

        connection.send({
            type: "file-end"
        });

        progressPercent.textContent = "100%";
        progressBar.style.width = "100%";
        progressStatus.textContent = "Archivo enviado";
        progressSpeed.textContent = "";

    } catch (error) {
        console.error("Error enviando archivo:", error);

        progressStatus.textContent =
            "Error al enviar el archivo";

        showModal(
            "⚠️",
            "Error de transferencia",
            "No se pudo completar el envío del archivo."
        );

    } finally {
        sendFileBtn.disabled = false;
        removeFileBtn.disabled = false;
    }
}

/* =========================================================
   RECEPCIÓN
   ========================================================= */

function handleIncomingData(data) {
    if (!data || typeof data !== "object") {
        return;
    }

    if (data.type === "file-start") {
        startIncomingFile(data);
        return;
    }

    if (data.type === "file-chunk") {
        receiveFileChunk(data);
        return;
    }

    if (data.type === "file-end") {
        finishIncomingFile();
    }
}

function startIncomingFile(data) {
    incomingTransfers = {
        name: data.name || "archivo",
        size: Number(data.size) || 0,
        mime: data.mime || "application/octet-stream",
        totalChunks: Number(data.totalChunks) || 0,
        chunks: [],
        receivedChunks: 0,
        receivedBytes: 0,
        startTime: performance.now()
    };

    progressCard.classList.remove("hidden");

    progressTitle.textContent =
        `Recibiendo ${incomingTransfers.name}`;

    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";

    progressStatus.textContent =
        `0 B / ${formatFileSize(incomingTransfers.size)}`;

    progressSpeed.textContent = "";
}

function receiveFileChunk(data) {
    if (!incomingTransfers || !incomingTransfers.chunks) {
        return;
    }

    const chunk =
        data.data instanceof ArrayBuffer
            ? data.data
            : data.data?.buffer;

    if (!chunk) {
        return;
    }

    incomingTransfers.chunks[data.index] = chunk;
    incomingTransfers.receivedChunks++;

    incomingTransfers.receivedBytes +=
        chunk.byteLength || 0;

    const percent =
        incomingTransfers.size === 0
            ? 100
            : Math.round(
                (incomingTransfers.receivedBytes /
                    incomingTransfers.size) *
                100
            );

    const elapsed =
        (performance.now() -
            incomingTransfers.startTime) / 1000;

    const speed =
        elapsed > 0
            ? incomingTransfers.receivedBytes / elapsed
            : 0;

    progressPercent.textContent =
        `${Math.min(percent, 100)}%`;

    progressBar.style.width =
        `${Math.min(percent, 100)}%`;

    progressStatus.textContent =
        `${formatFileSize(incomingTransfers.receivedBytes)} / ${formatFileSize(incomingTransfers.size)}`;

    progressSpeed.textContent =
        `${formatFileSize(speed)}/s`;
}

function finishIncomingFile() {
    if (!incomingTransfers) {
        return;
    }

    const transfer = incomingTransfers;

    try {
        const blob = new Blob(
            transfer.chunks,
            {
                type: transfer.mime
            }
        );

        const url = URL.createObjectURL(blob);

        const receivedFile = {
            name: transfer.name,
            size: transfer.size,
            url,
            createdAt: Date.now()
        };

        receivedFiles.unshift(receivedFile);

        renderReceivedFiles();

        progressPercent.textContent = "100%";
        progressBar.style.width = "100%";
        progressStatus.textContent = "Archivo recibido";
        progressSpeed.textContent = "";

        receivedSection.classList.remove("hidden");

        showModal(
            "✓",
            "Archivo recibido",
            `"${transfer.name}" se recibió correctamente.`
        );

    } catch (error) {
        console.error(
            "Error construyendo archivo:",
            error
        );

        progressStatus.textContent =
            "Error al guardar el archivo";
    }

    incomingTransfers = {};
}

function renderReceivedFiles() {
    if (!receivedFilesList) {
        return;
    }

    receivedFilesList.innerHTML = "";

    receivedFiles.forEach(file => {
        const item = document.createElement("div");

        item.className = "received-file";

        item.innerHTML = `
            <div class="received-file-info">
                <div class="received-file-name"></div>
                <div class="received-file-size"></div>
            </div>
            <a class="received-download" download></a>
        `;

        const nameElement =
            item.querySelector(".received-file-name");

        const sizeElement =
            item.querySelector(".received-file-size");

        const downloadElement =
            item.querySelector(".received-download");

        nameElement.textContent = file.name;
        sizeElement.textContent =
            formatFileSize(file.size);

        downloadElement.textContent =
            "Descargar";

        downloadElement.href = file.url;
        downloadElement.download = file.name;

        receivedFilesList.appendChild(item);
    });

    if (receivedCount) {
        receivedCount.textContent =
            receivedFiles.length;
    }
}

/* =========================================================
   PROGRESO
   ========================================================= */

function resetProgress() {
    if (!progressCard) {
        return;
    }

    progressCard.classList.add("hidden");

    progressTitle.textContent = "";
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    progressStatus.textContent = "";
    progressSpeed.textContent = "";
}

/* =========================================================
   ESTADO
   ========================================================= */

function setStatus(type, text) {
    if (statusText) {
        statusText.textContent = text;
    }

    if (statusBadge) {
        statusBadge.className = "status-badge";

        statusBadge.classList.add(
            `status-${type}`
        );
    }
}

/* =========================================================
   MODAL
   ========================================================= */

function showModal(
    icon,
    title,
    message,
    confirmText = "Aceptar",
    onConfirm = null
) {
    if (!customModal) {
        alert(`${title}\n\n${message}`);
        return;
    }

    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    modalConfirmBtn.textContent = confirmText;

    customModal.classList.remove("hidden");

    modalConfirmBtn.onclick = () => {
        if (typeof onConfirm === "function") {
            onConfirm();
        }

        closeModal();
    };
}

function closeModal() {
    if (customModal) {
        customModal.classList.add("hidden");
    }
}

/* =========================================================
   UTILIDADES
   ========================================================= */

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index = Math.floor(
        Math.log(bytes) / Math.log(1024)
    );

    const safeIndex =
        Math.min(index, units.length - 1);

    const value =
        bytes / Math.pow(1024, safeIndex);

    if (safeIndex === 0) {
        return `${Math.round(value)} ${units[safeIndex]}`;
    }

    return `${value.toFixed(value >= 100 ? 0 : 2)} ${units[safeIndex]}`;
}
