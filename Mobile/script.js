const CHUNK_SIZE = 64 * 1024;

const PEER_ID_LENGTH = 6;

const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const PC_HOST =
    "peerdrop.dns.navy";

const MOBILE_HOST =
    "mobile.peerdrop.dns.navy";


let peer = null;

let connection = null;

let selectedFile = null;

let pendingPeerId = null;

let receivedFiles = [];

let incomingTransfer = null;


/* DOM */

const statusBadge =
    document.getElementById("statusBadge");

const statusText =
    document.getElementById("statusText");

const connectionSection =
    document.getElementById("connectionSection");

const transferSection =
    document.getElementById("transferSection");

const shareLinkInput =
    document.getElementById("shareLinkInput");

const copyLinkBtn =
    document.getElementById("copyLinkBtn");

const myIdDisplay =
    document.getElementById("myIdDisplay");

const connectForm =
    document.getElementById("connectForm");

const remoteIdInput =
    document.getElementById("remoteIdInput");

const connectionTarget =
    document.getElementById("connectionTarget");

const disconnectBtn =
    document.getElementById("disconnectBtn");

const dropZone =
    document.getElementById("dropZone");

const selectFileBtn =
    document.getElementById("selectFileBtn");

const fileInput =
    document.getElementById("fileInput");

const fileCard =
    document.getElementById("fileCard");

const fileName =
    document.getElementById("fileName");

const fileSize =
    document.getElementById("fileSize");

const removeFileBtn =
    document.getElementById("removeFileBtn");

const sendFileBtn =
    document.getElementById("sendFileBtn");

const progressCard =
    document.getElementById("progressCard");

const progressTitle =
    document.getElementById("progressTitle");

const progressPercent =
    document.getElementById("progressPercent");

const progressBar =
    document.getElementById("progressBar");

const progressStatus =
    document.getElementById("progressStatus");

const progressSpeed =
    document.getElementById("progressSpeed");

const receivedFilesList =
    document.getElementById("receivedFilesList");

const receivedCount =
    document.getElementById("receivedCount");

const customModal =
    document.getElementById("customModal");

const modalIcon =
    document.getElementById("modalIcon");

const modalTitle =
    document.getElementById("modalTitle");

const modalMessage =
    document.getElementById("modalMessage");

const modalCancelBtn =
    document.getElementById("modalCancelBtn");

const modalConfirmBtn =
    document.getElementById("modalConfirmBtn");


/* INIT */

function initialize() {

    setupEvents();

    pendingPeerId =
        getPeerIdFromHash();


    if (redirectForDevice()) {
        return;
    }


    initializePeer();
}


/* DEVICE */

function isMobileDevice() {

    return (
        /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i
            .test(navigator.userAgent)
    )
    ||
    window.matchMedia(
        "(max-width: 700px)"
    ).matches;
}


function redirectForDevice() {

    const hostname =
        window.location.hostname.toLowerCase();

    const hash =
        window.location.hash;


    if (
        hostname === PC_HOST &&
        isMobileDevice()
    ) {

        window.location.replace(
            `https://${MOBILE_HOST}/Mobile/${hash}`
        );

        return true;
    }


    if (
        hostname === MOBILE_HOST &&
        !isMobileDevice()
    ) {

        window.location.replace(
            `https://${PC_HOST}/${hash}`
        );

        return true;
    }


    return false;
}


/* PEER */

function generateShortPeerId() {

    let id = "";


    for (
        let i = 0;
        i < PEER_ID_LENGTH;
        i++
    ) {

        const randomIndex =
            Math.floor(
                Math.random() *
                characters.length
            );

        id +=
            characters[randomIndex];
    }


    return id;
}


function initializePeer() {

    const shortId =
        generateShortPeerId();


    peer =
        new Peer(
            shortId,
            {
                debug: 0
            }
        );


    peer.on(
        "open",
        id => {

            myIdDisplay.textContent =
                id;

            shareLinkInput.value =
                generateShareLink(id);

            copyLinkBtn.disabled =
                false;

            setStatus(
                "connected",
                "Listo"
            );


            if (
                pendingPeerId &&
                !connection
            ) {

                const targetId =
                    pendingPeerId;

                pendingPeerId =
                    null;


                setTimeout(
                    () => {

                        connectToPeer(
                            targetId,
                            true
                        );

                    },
                    100
                );
            }
        }
    );


    peer.on(
        "connection",
        incomingConnection => {

            if (connection) {

                try {
                    incomingConnection.close();
                } catch {}

                return;
            }


            connection =
                incomingConnection;


            setupConnection(
                incomingConnection
            );
        }
    );


    peer.on(
        "error",
        error => {

            console.error(
                "PeerJS error:",
                error
            );


            if (
                error.type ===
                "unavailable-id"
            ) {

                try {
                    peer.destroy();
                } catch {}


                setTimeout(
                    initializePeer,
                    150
                );

                return;
            }


            if (
                error.type ===
                "peer-unavailable"
            ) {

                setStatus(
                    "error",
                    "No encontrado"
                );


                showModal(
                    "!",
                    "Dispositivo no encontrado",
                    "No se pudo encontrar el código indicado."
                );

                return;
            }


            setStatus(
                "error",
                "Error"
            );
        }
    );


    peer.on(
        "disconnected",
        () => {

            setStatus(
                "error",
                "Desconectado"
            );
        }
    );
}


/* CONNECT */

function connectToPeer(
    id,
    fromDirectLink = false
) {

    if (!peer) {

        pendingPeerId =
            id;

        return;
    }


    if (!peer.open) {

        pendingPeerId =
            id;

        return;
    }


    if (
        !id ||
        id.length !== PEER_ID_LENGTH
    ) {

        showModal(
            "!",
            "Código inválido",
            "El código debe tener 6 caracteres."
        );

        return;
    }


    id =
        id
            .trim()
            .toUpperCase();


    if (id === peer.id) {

        showModal(
            "!",
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


    setStatus(
        "connecting",
        "Conectando..."
    );


    connectionTarget.textContent =
        `Conectando con ${id}...`;


    try {

        const newConnection =
            peer.connect(
                id,
                {
                    reliable: true
                }
            );


        setupConnection(
            newConnection
        );

    } catch (error) {

        console.error(error);

        setStatus(
            "error",
            "Error"
        );
    }
}


/* CONNECTION */

function setupConnection(conn) {

    connection =
        conn;


    conn.on(
        "open",
        () => {

            setStatus(
                "connected",
                "Conectado"
            );


            connectionTarget.textContent =
                `Conectado con ${conn.peer}`;


            connectionSection.classList.add(
                "hidden"
            );


            transferSection.classList.remove(
                "hidden"
            );


            transferSection.classList.add(
                "fade-in"
            );


            history.replaceState(
                null,
                "",
                window.location.pathname +
                window.location.search
            );
        }
    );


    conn.on(
        "data",
        handleIncomingData
    );


    conn.on(
        "close",
        () => {

            if (
                connection === conn
            ) {

                connection = null;


                transferSection.classList.add(
                    "hidden"
                );


                connectionSection.classList.remove(
                    "hidden"
                );


                setStatus(
                    "connected",
                    "Listo"
                );


                connectionTarget.textContent =
                    "Desconectado";
            }
        }
    );


    conn.on(
        "error",
        error => {

            console.error(
                "Connection error:",
                error
            );

            setStatus(
                "error",
                "Error"
            );
        }
    );
}


/* HASH */

function getPeerIdFromHash() {

    const hash =
        window.location.hash;


    if (
        !hash ||
        hash.length < 2
    ) {
        return null;
    }


    try {

        return decodeURIComponent(
            hash.substring(1)
        )
            .trim()
            .toUpperCase();

    } catch {

        return hash
            .substring(1)
            .trim()
            .toUpperCase();
    }
}


function handleHashChange() {

    const id =
        getPeerIdFromHash();


    if (!id) {
        return;
    }


    if (
        !peer ||
        !peer.open
    ) {

        pendingPeerId =
            id;

        return;
    }


    if (connection) {
        return;
    }


    pendingPeerId =
        null;


    connectToPeer(
        id,
        true
    );
}


/* SHARE */

function generateShareLink(id) {

    const url =
        new URL(
            window.location.href
        );


    url.hash =
        encodeURIComponent(id);


    return url.toString();
}


/* EVENTS */

function setupEvents() {

    connectForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            connectToPeer(
                remoteIdInput.value
            );
        }
    );


    remoteIdInput.addEventListener(
        "input",
        () => {

            remoteIdInput.value =
                remoteIdInput.value
                    .replace(
                        /[^a-zA-Z0-9]/g,
                        ""
                    )
                    .toUpperCase()
                    .slice(
                        0,
                        PEER_ID_LENGTH
                    );
        }
    );


    copyLinkBtn.addEventListener(
        "click",
        async () => {

            try {

                await navigator.clipboard.writeText(
                    shareLinkInput.value
                );


                copyLinkBtn.textContent =
                    "Copiado";


                setTimeout(
                    () => {

                        copyLinkBtn.textContent =
                            "Copiar";

                    },
                    1500
                );

            } catch {

                shareLinkInput.select();

                document.execCommand(
                    "copy"
                );
            }
        }
    );


    selectFileBtn.addEventListener(
        "click",
        () => fileInput.click()
    );


    fileInput.addEventListener(
        "change",
        event => {

            const file =
                event.target.files[0];


            if (file) {
                selectFile(file);
            }
        }
    );


    removeFileBtn.addEventListener(
        "click",
        clearSelectedFile
    );


    sendFileBtn.addEventListener(
        "click",
        sendSelectedFile
    );


    dropZone.addEventListener(
        "dragover",
        event => {

            event.preventDefault();

            dropZone.classList.add(
                "dragover"
            );
        }
    );


    dropZone.addEventListener(
        "dragleave",
        () => {

            dropZone.classList.remove(
                "dragover"
            );
        }
    );


    dropZone.addEventListener(
        "drop",
        event => {

            event.preventDefault();

            dropZone.classList.remove(
                "dragover"
            );


            const file =
                event.dataTransfer.files[0];


            if (file) {
                selectFile(file);
            }
        }
    );


    disconnectBtn.addEventListener(
        "click",
        disconnect
    );


    modalCancelBtn.addEventListener(
        "click",
        closeModal
    );


    window.addEventListener(
        "hashchange",
        handleHashChange
    );
}


/* FILE */

function selectFile(file) {

    selectedFile =
        file;


    fileName.textContent =
        file.name;


    fileSize.textContent =
        formatBytes(
            file.size
        );


    fileCard.classList.remove(
        "hidden"
    );
}


function clearSelectedFile() {

    selectedFile =
        null;


    fileInput.value =
        "";


    fileCard.classList.add(
        "hidden"
    );
}


/* SEND */

async function sendSelectedFile() {

    if (
        !selectedFile ||
        !connection ||
        !connection.open
    ) {

        return;
    }


    const file =
        selectedFile;


    progressCard.classList.remove(
        "hidden"
    );


    progressTitle.textContent =
        `Enviando ${file.name}`;


    progressStatus.textContent =
        "Preparando...";


    progressSpeed.textContent =
        "";


    progressBar.style.width =
        "0%";


    progressPercent.textContent =
        "0%";


    const startTime =
        performance.now();


    connection.send({
        type: "file-start",

        name: file.name,

        size: file.size,

        mime:
            file.type ||
            "application/octet-stream"
    });


    let offset = 0;


    while (
        offset < file.size
    ) {

        const chunk =
            await file
                .slice(
                    offset,
                    offset + CHUNK_SIZE
                )
                .arrayBuffer();


        connection.send({
            type: "file-chunk",

            data: chunk
        });


        offset +=
            chunk.byteLength;


        const percent =
            file.size === 0
                ? 100
                : Math.min(
                    100,
                    Math.round(
                        (
                            offset /
                            file.size
                        ) *
                        100
                    )
                );


        progressBar.style.width =
            `${percent}%`;


        progressPercent.textContent =
            `${percent}%`;


        const elapsed =
            (
                performance.now() -
                startTime
            ) / 1000;


        if (elapsed > 0) {

            progressSpeed.textContent =
                `${formatBytes(
                    offset / elapsed
                )}/s`;
        }


        progressStatus.textContent =
            `${formatBytes(offset)} / ${formatBytes(file.size)}`;
    }


    connection.send({
        type: "file-end"
    });


    progressStatus.textContent =
        "Transferencia completada";


    progressBar.style.width =
        "100%";


    progressPercent.textContent =
        "100%";


    setTimeout(
        () => {

            progressCard.classList.add(
                "hidden"
            );

        },
        1800
    );
}


/* RECEIVE */

function handleIncomingData(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        return;
    }


    if (
        data.type ===
        "file-start"
    ) {

        incomingTransfer = {

            name:
                data.name,

            size:
                data.size,

            mime:
                data.mime ||
                "application/octet-stream",

            chunks: [],

            received: 0,

            startTime:
                performance.now()
        };


        progressCard.classList.remove(
            "hidden"
        );


        progressTitle.textContent =
            `Recibiendo ${data.name}`;


        progressStatus.textContent =
            "Recibiendo...";


        progressSpeed.textContent =
            "";


        progressBar.style.width =
            "0%";


        progressPercent.textContent =
            "0%";


        return;
    }


    if (
        data.type ===
        "file-chunk"
    ) {

        if (!incomingTransfer) {
            return;
        }


        incomingTransfer.chunks.push(
            data.data
        );


        incomingTransfer.received +=
            data.data.byteLength;


        updateReceiveProgress();

        return;
    }


    if (
        data.type ===
        "file-end"
    ) {

        finishIncomingTransfer();
    }
}


/* RECEIVE PROGRESS */

function updateReceiveProgress() {

    if (!incomingTransfer) {
        return;
    }


    const transfer =
        incomingTransfer;


    const percent =
        transfer.size === 0
            ? 100
            : Math.min(
                100,
                Math.round(
                    (
                        transfer.received /
                        transfer.size
                    ) *
                    100
                )
            );


    progressBar.style.width =
        `${percent}%`;


    progressPercent.textContent =
        `${percent}%`;


    progressStatus.textContent =
        `${formatBytes(
            transfer.received
        )} / ${formatBytes(
            transfer.size
        )}`;


    const elapsed =
        (
            performance.now() -
            transfer.startTime
        ) / 1000;


    if (elapsed > 0) {

        progressSpeed.textContent =
            `${formatBytes(
                transfer.received /
                elapsed
            )}/s`;
    }
}


/* FINISH RECEIVE */

function finishIncomingTransfer() {

    if (!incomingTransfer) {
        return;
    }


    const transfer =
        incomingTransfer;


    const blob =
        new Blob(
            transfer.chunks,
            {
                type: transfer.mime
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    addReceivedFile(
        transfer.name,
        transfer.size,
        url
    );


    progressBar.style.width =
        "100%";


    progressPercent.textContent =
        "100%";


    progressStatus.textContent =
        "Transferencia completada";


    incomingTransfer =
        null;


    setTimeout(
        () => {

            progressCard.classList.add(
                "hidden"
            );

        },
        1800
    );
}


/* RECEIVED */

function addReceivedFile(
    name,
    size,
    url
) {

    receivedFiles.push({
        name,
        size,
        url
    });


    receivedCount.textContent =
        receivedFiles.length;


    const empty =
        receivedFilesList.querySelector(
            ".empty-state"
        );


    if (empty) {
        empty.remove();
    }


    const item =
        document.createElement(
            "div"
        );


    item.className =
        "received-file";


    const info =
        document.createElement(
            "div"
        );


    info.className =
        "received-file-info";


    const title =
        document.createElement(
            "strong"
        );


    title.textContent =
        name;


    const sizeElement =
        document.createElement(
            "span"
        );


    sizeElement.textContent =
        formatBytes(size);


    info.appendChild(title);

    info.appendChild(sizeElement);


    const button =
        document.createElement(
            "a"
        );


    button.className =
        "secondary-btn download-btn";


    button.textContent =
        "Descargar";


    button.href =
        url;


    button.download =
        name;


    item.appendChild(info);

    item.appendChild(button);


    receivedFilesList.prepend(
        item
    );
}


/* DISCONNECT */

function disconnect() {

    if (connection) {

        try {
            connection.close();
        } catch {}

        connection =
            null;
    }


    clearSelectedFile();


    transferSection.classList.add(
        "hidden"
    );


    connectionSection.classList.remove(
        "hidden"
    );


    setStatus(
        "connected",
        "Listo"
    );


    history.replaceState(
        null,
        "",
        window.location.pathname +
        window.location.search
    );
}


/* STATUS */

function setStatus(
    type,
    text
) {

    statusBadge.classList.remove(
        "connected",
        "error"
    );


    if (
        type ===
        "connected"
    ) {

        statusBadge.classList.add(
            "connected"
        );

    } else if (
        type ===
        "error"
    ) {

        statusBadge.classList.add(
            "error"
        );
    }


    statusText.textContent =
        text;
}


/* MODAL */

function showModal(
    icon,
    title,
    message
) {

    modalIcon.textContent =
        icon;


    modalTitle.textContent =
        title;


    modalMessage.textContent =
        message;


    customModal.classList.remove(
        "hidden"
    );


    modalConfirmBtn.onclick =
        closeModal;
}


function closeModal() {

    customModal.classList.add(
        "hidden"
    );
}


/* FORMAT */

function formatBytes(bytes) {

    if (
        !bytes ||
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


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return `${(
        bytes /
        Math.pow(
            1024,
            index
        )
    ).toFixed(
        index === 0
            ? 0
            : 2
    )} ${units[index]}`;
}


initialize();