"use strict";

/* =========================================================
   PEERDROP - PC
   ========================================================= */

const CHUNK_SIZE = 64 * 1024;
const PEER_ID_LENGTH = 6;
const MOBILE_PATH = "/Mobile/";

const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let peer = null;
let connection = null;
let selectedFile = null;
let pendingPeerId = null;

let incomingTransfer = null;
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

    if (redirectForDevice()) {
        return;
    }

    initializePeer();
}

/* =========================================================
   DETECCIÓN DE DISPOSITIVO
   ========================================================= */

function isMobileDevice() {
    return (
        /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(
            navigator.userAgent
        ) ||
        window.matchMedia("(max-width: 700px)").matches
    );
}

function redirectForDevice() {
    const mobile = isMobileDevice();
    const path = window.location.pathname;

    const isMobilePage =
        path === MOBILE_PATH ||
        path.startsWith(MOBILE_PATH);

    if (mobile && !isMobilePage) {
        const hash = window.location.hash || "";

        window.location.replace(
            `${window.location.origin}${MOBILE_PATH}${hash}`
        );

        return true;
    }

    if (!mobile && isMobilePage) {
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

            connectToPeer(
                remoteIdInput.value.trim().toUpperCase()
            );
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", copyShareLink);
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", disconnect);
    }

    if (selectFileBtn && fileInput) {
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
        removeFileBtn.addEventListener(
            "click",
            removeSelectedFile
        );
    }

    if (sendFileBtn) {
        sendFileBtn.addEventListener(
            "click",
            sendSelectedFile
        );
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

    window.addEventListener(
        "hashchange",
        handleHashChange
    );

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener(
            "click",
            closeModal
        );
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
        console.error(error);

        setStatus("error", "Error");

        showModal(
            "⚠️",
            "Error",
            "No se pudo iniciar PeerDrop."
        );

        return;
    }

    peer.on("open", id => {
        myIdDisplay.textContent = id;

        if (shareLinkInput) {
            shareLinkInput.value =
                generateShareLink(id);
        }

        if (copyLinkBtn) {
            copyLinkBtn.disabled = false;
        }

        setStatus("connected", "Listo");

        if (pendingPeerId && !connection) {
            const target = pendingPeerId;

            pendingPeerId = null;

            setTimeout(() => {
                connectToPeer(target, true);
            }, 100);
        }
    });

    peer.on("connection", conn => {
        if (connection) {
            try {
                conn.close();
            } catch {}

            return;
        }

        setupConnection(conn);
    });

    peer.on("error", error => {
        console.error("PeerJS:", error);

        if (error.type === "unavailable-id") {
            try {
                peer.destroy();
            } catch {}

            peer = null;

            setTimeout(
                initializePeer,
                150
            );

            return;
        }

        if (error.type === "peer-unavailable") {
            setStatus(
                "error",
                "No encontrado"
            );

            showModal(
                "⚠️",
                "Dispositivo no encontrado",
                "No se encontró ese código."
            );

            return;
        }

        setStatus("error", "Error");
    });

    peer.on("disconnected", () => {
        if (!connection) {
            setStatus(
                "connecting",
                "Reconectando..."
            );

            try {
                peer.reconnect();
            } catch {}
        }
    });
}

/* =========================================================
   ID
   ========================================================= */

function generateShortPeerId() {
    let id = "";

    for (
        let i = 0;
        i < PEER_ID_LENGTH;
        i++
    ) {
        id += characters[
            Math.floor(
                Math.random() *
                characters.length
            )
        ];
    }

    return id;
}

function getPeerIdFromHash() {
    const hash =
        window.location.hash
            .replace(/^#/, "")
            .trim();

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

function generateShareLink(id) {
    const url = new URL(
        window.location.href
    );

    url.hash =
        encodeURIComponent(id);

    return url.toString();
}

/* =========================================================
   COPIAR
   ========================================================= */

async function copyShareLink() {
    if (
        !shareLinkInput ||
        !shareLinkInput.value
    ) {
        return;
    }

    try {
        await navigator.clipboard.writeText(
            shareLinkInput.value
        );

        const old =
            copyLinkBtn.textContent;

        copyLinkBtn.textContent =
            "Copiado";

        setTimeout(() => {
            copyLinkBtn.textContent =
                old;
        }, 1500);

    } catch {
        shareLinkInput.select();

        document.execCommand("copy");

        showModal(
            "✓",
            "Copiado",
            "El enlace fue copiado."
        );
    }
}

/* =========================================================
   CONEXIÓN
   ========================================================= */

function connectToPeer(
    id,
    fromDirectLink = false
) {
    if (!id) {
        showModal(
            "⚠️",
            "Código vacío",
            "Introduce un código."
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
            "El código debe tener 6 caracteres."
        );

        return;
    }

    if (id === peer.id) {
        showModal(
            "⚠️",
            "Código inválido",
            "No puedes conectarte contigo mismo."
        );

        return;
    }

    if (connection) {
        try {
            connection.close();
        } catch {}

        connection = null;
    }

    setStatus(
        "connecting",
        "Conectando..."
    );

    if (connectionTarget) {
        connectionTarget.textContent =
            `Conectando con ${id}...`;
    }

    try {
        const conn = peer.connect(
            id,
            {
                reliable: true
            }
        );

        setupConnection(conn);

    } catch (error) {
        console.error(error);

        setStatus(
            "error",
            "Error"
        );
    }
}

function setupConnection(conn) {
    connection = conn;

    conn.on("open", () => {
        if (connectionTarget) {
            connectionTarget.textContent =
                `Conectado con ${conn.peer}`;
        }

        setStatus(
            "connected",
            "Conectado"
        );

        if (connectionSection) {
            connectionSection.classList.add(
                "hidden"
            );
        }

        if (transferSection) {
            transferSection.classList.remove(
                "hidden"
            );
        }

        if (window.location.hash) {
            history.replaceState(
                null,
                "",
                window.location.pathname +
                window.location.search
            );
        }
    });

    conn.on(
        "data",
        handleIncomingData
    );

    conn.on("close", () => {
        connection = null;

        setStatus(
            "connected",
            "Listo"
        );

        if (connectionSection) {
            connectionSection.classList.remove(
                "hidden"
            );
        }

        if (transferSection) {
            transferSection.classList.add(
                "hidden"
            );
        }

        if (connectionTarget) {
            connectionTarget.textContent =
                "Sin conexión";
        }

        resetProgress();
    });

    conn.on("error", error => {
        console.error(
            "Connection:",
            error
        );

        connection = null;

        setStatus(
            "error",
            "Error de conexión"
        );
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
        connectionSection.classList.remove(
            "hidden"
        );
    }

    if (transferSection) {
        transferSection.classList.add(
            "hidden"
        );
    }

    if (connectionTarget) {
        connectionTarget.textContent =
            "Sin conexión";
    }

    setStatus(
        "connected",
        "Listo"
    );

    resetProgress();
}

/* =========================================================
   HASH
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
   ARCHIVO A ENVIAR
   ========================================================= */

function selectFile(file) {
    selectedFile = file;

    if (fileName) {
        fileName.textContent =
            file.name;
    }

    if (fileSize) {
        fileSize.textContent =
            formatFileSize(file.size);
    }

    if (fileCard) {
        fileCard.classList.remove(
            "hidden"
        );
    }

    if (sendFileBtn) {
        sendFileBtn.disabled =
            !connection;
    }
}

function removeSelectedFile() {
    selectedFile = null;

    if (fileInput) {
        fileInput.value = "";
    }

    if (fileCard) {
        fileCard.classList.add(
            "hidden"
        );
    }

    if (sendFileBtn) {
        sendFileBtn.disabled = true;
    }
}

/* =========================================================
   ENVÍO
   ========================================================= */

async function sendSelectedFile() {
    if (!selectedFile) {
        return;
    }

    if (
        !connection ||
        !connection.open
    ) {
        showModal(
            "⚠️",
            "Sin conexión",
            "Primero conecta otro dispositivo."
        );

        return;
    }

    const file = selectedFile;

    if (sendFileBtn) {
        sendFileBtn.disabled = true;
    }

    if (removeFileBtn) {
        removeFileBtn.disabled = true;
    }

    showProgress(
        `Enviando ${file.name}`
    );

    const totalChunks =
        Math.ceil(
            file.size / CHUNK_SIZE
        );

    let offset = 0;
    let index = 0;

    const startTime =
        performance.now();

    try {
        connection.send({
            type: "file-start",
            name: file.name,
            size: file.size,
            mime:
                file.type ||
                "application/octet-stream",
            totalChunks
        });

        while (
            offset < file.size
        ) {
            const chunk =
                file.slice(
                    offset,
                    offset + CHUNK_SIZE
                );

            const buffer =
                await chunk.arrayBuffer();

            connection.send({
                type: "file-chunk",
                index,
                data: buffer
            });

            offset += chunk.size;
            index++;

            updateProgress(
                offset,
                file.size,
                startTime
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        0
                    )
            );
        }

        connection.send({
            type: "file-end"
        });

        setProgressText(
            "Archivo enviado",
            "100%"
        );

    } catch (error) {
        console.error(
            "Error enviando:",
            error
        );

        setProgressText(
            "Error al enviar",
            "0%"
        );

        showModal(
            "⚠️",
            "Error de transferencia",
            "No se pudo completar el envío."
        );

    } finally {
        if (sendFileBtn) {
            sendFileBtn.disabled = false;
        }

        if (removeFileBtn) {
            removeFileBtn.disabled = false;
        }
    }
}

/* =========================================================
   RECEPCIÓN
   ========================================================= */

function handleIncomingData(data) {
    if (
        !data ||
        typeof data !== "object"
    ) {
        return;
    }

    switch (data.type) {
        case "file-start":
            startIncomingFile(data);
            break;

        case "file-chunk":
            receiveFileChunk(data);
            break;

        case "file-end":
            finishIncomingFile();
            break;
    }
}

function startIncomingFile(data) {
    incomingTransfer = {
        name:
            data.name ||
            "archivo",

        size:
            Number(data.size) || 0,

        mime:
            data.mime ||
            "application/octet-stream",

        totalChunks:
            Number(data.totalChunks) || 0,

        chunks: [],

        receivedChunks: 0,

        receivedBytes: 0,

        startTime:
            performance.now()
    };

    showProgress(
        `Recibiendo ${incomingTransfer.name}`
    );

    setProgressText(
        `0 B / ${formatFileSize(incomingTransfer.size)}`,
        "0%"
    );
}

function receiveFileChunk(data) {
    if (
        !incomingTransfer ||
        !incomingTransfer.chunks
    ) {
        return;
    }

    let buffer = data.data;

    if (
        !(buffer instanceof ArrayBuffer)
    ) {
        if (
            buffer &&
            buffer.buffer instanceof ArrayBuffer
        ) {
            buffer = buffer.buffer;
        } else {
            return;
        }
    }

    incomingTransfer.chunks[
        data.index
    ] = buffer;

    incomingTransfer.receivedChunks++;

    incomingTransfer.receivedBytes +=
        buffer.byteLength || 0;

    updateProgress(
        incomingTransfer.receivedBytes,
        incomingTransfer.size,
        incomingTransfer.startTime
    );
}

function finishIncomingFile() {
    if (!incomingTransfer) {
        return;
    }

    const transfer =
        incomingTransfer;

    try {
        const blob = new Blob(
            transfer.chunks,
            {
                type: transfer.mime
            }
        );

        const url =
            URL.createObjectURL(blob);

        const file = {
            name: transfer.name,
            size: transfer.size,
            url
        };

        receivedFiles.unshift(file);

        /*
         * IMPORTANTE:
         * addReceivedFile() es segura incluso si
         * receivedSection o receivedFilesList
         * no existen en el HTML.
         */
        addReceivedFile(file);

        setProgressText(
            "Archivo recibido",
            "100%"
        );

        showModal(
            "✓",
            "Archivo recibido",
            `"${transfer.name}" se recibió correctamente.`
        );

    } catch (error) {
        console.error(
            "Error procesando archivo:",
            error
        );

        setProgressText(
            "Error al procesar archivo",
            "0%"
        );
    }

    incomingTransfer = null;
}

/* =========================================================
   ARCHIVOS RECIBIDOS
   ========================================================= */

function addReceivedFile(file) {
    /*
     * Si el HTML tiene una lista de recibidos,
     * la usamos.
     *
     * Si no existe, NO rompemos la recepción.
     */
    if (!receivedFilesList) {
        return;
    }

    const item =
        document.createElement("div");

    item.className =
        "received-file";

    const info =
        document.createElement("div");

    info.className =
        "received-file-info";

    const name =
        document.createElement("div");

    name.className =
        "received-file-name";

    name.textContent =
        file.name;

    const size =
        document.createElement("div");

    size.className =
        "received-file-size";

    size.textContent =
        formatFileSize(file.size);

    const download =
        document.createElement("a");

    download.className =
        "received-download";

    download.textContent =
        "Descargar";

    download.href =
        file.url;

    download.download =
        file.name;

    info.appendChild(name);
    info.appendChild(size);

    item.appendChild(info);
    item.appendChild(download);

    receivedFilesList.prepend(item);

    if (receivedCount) {
        receivedCount.textContent =
            receivedFiles.length;
    }

    /*
     * ESTA ES LA CORRECCIÓN DEL ERROR.
     */
    if (receivedSection) {
        receivedSection.classList.remove(
            "hidden"
        );
    }
}

/* =========================================================
   PROGRESO
   ========================================================= */

function showProgress(title) {
    if (!progressCard) {
        return;
    }

    progressCard.classList.remove(
        "hidden"
    );

    if (progressTitle) {
        progressTitle.textContent =
            title;
    }

    if (progressPercent) {
        progressPercent.textContent =
            "0%";
    }

    if (progressBar) {
        progressBar.style.width =
            "0%";
    }

    if (progressStatus) {
        progressStatus.textContent =
            "Preparando...";
    }

    if (progressSpeed) {
        progressSpeed.textContent =
            "";
    }
}

function updateProgress(
    current,
    total,
    startTime
) {
    if (total <= 0) {
        return;
    }

    const percent = Math.min(
        100,
        Math.round(
            (current / total) * 100
        )
    );

    const elapsed =
        (
            performance.now() -
            startTime
        ) / 1000;

    const speed =
        elapsed > 0
            ? current / elapsed
            : 0;

    if (progressPercent) {
        progressPercent.textContent =
            `${percent}%`;
    }

    if (progressBar) {
        progressBar.style.width =
            `${percent}%`;
    }

    if (progressStatus) {
        progressStatus.textContent =
            `${formatFileSize(current)} / ${formatFileSize(total)}`;
    }

    if (progressSpeed) {
        progressSpeed.textContent =
            `${formatFileSize(speed)}/s`;
    }
}

function setProgressText(
    status,
    percent
) {
    if (progressStatus) {
        progressStatus.textContent =
            status;
    }

    if (progressPercent) {
        progressPercent.textContent =
            percent;
    }

    if (progressBar) {
        progressBar.style.width =
            percent;
    }

    if (progressSpeed) {
        progressSpeed.textContent =
            "";
    }
}

function resetProgress() {
    if (!progressCard) {
        return;
    }

    progressCard.classList.add(
        "hidden"
    );

    if (progressTitle) {
        progressTitle.textContent =
            "";
    }

    if (progressPercent) {
        progressPercent.textContent =
            "0%";
    }

    if (progressBar) {
        progressBar.style.width =
            "0%";
    }

    if (progressStatus) {
        progressStatus.textContent =
            "";
    }

    if (progressSpeed) {
        progressSpeed.textContent =
            "";
    }
}

/* =========================================================
   ESTADO
   ========================================================= */

function setStatus(
    type,
    text
) {
    if (statusText) {
        statusText.textContent =
            text;
    }

    if (statusBadge) {
        statusBadge.className =
            "status-badge";

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
        alert(
            `${title}\n\n${message}`
        );

        return;
    }

    if (modalIcon) {
        modalIcon.textContent =
            icon;
    }

    if (modalTitle) {
        modalTitle.textContent =
            title;
    }

    if (modalMessage) {
        modalMessage.textContent =
            message;
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.textContent =
            confirmText;

        modalConfirmBtn.onclick = () => {
            if (
                typeof onConfirm ===
                "function"
            ) {
                onConfirm();
            }

            closeModal();
        };
    }

    customModal.classList.remove(
        "hidden"
    );
}

function closeModal() {
    if (customModal) {
        customModal.classList.add(
            "hidden"
        );
    }
}

/* =========================================================
   UTILIDADES
   ========================================================= */

function formatFileSize(bytes) {
    if (
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index = Math.min(
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        ),
        units.length - 1
    );

    const value =
        bytes /
        Math.pow(
            1024,
            index
        );

    if (index === 0) {
        return `${Math.round(value)} B`;
    }

    return `${value.toFixed(
        value >= 100 ? 0 : 2
    )} ${units[index]}`;
}
