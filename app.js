// REEMPLAZA ESTO CON LA URL GENERADA EN APPS SCRIPT
// CORRECTO (usa & para el segundo parámetro)
const url = `https://script.google.com/macros/s/AKfycbzW88AL3I1pgwWNxXHoZ3sLswQp7K6Qt9zhPf7hPfrIxXgkQdfKUxicEGozIZWpRrM_/exec?token=Macgregor281170&action=login&usuario=${usuario}&clave=${clave}`;
let db;
let currentUser = localStorage.getItem("user") || "";

// 1. Configurar Base de Datos Offline (IndexedDB)
const request = indexedDB.open("InterventoriaDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore("registros", { autoIncrement: true });
};
request.onsuccess = (e) => { 
    db = e.target.result; 
    checkQueue(); 
};

// 2. Control de Conectividad
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
    const ind = document.getElementById("status-indicator");
    if (navigator.onLine) {
        ind.className = "text-xs px-2 py-1 bg-green-500 text-white rounded font-bold";
        ind.innerText = "Online";
        if (db) { checkQueue(); } // <-- Esta es la clave: Solo revisa si la DB ya existe
    } else {
        ind.className = "text-xs px-2 py-1 bg-red-500 text-white rounded font-bold";
        ind.innerText = "Offline";
    }
}

// 3. Sistema de Login
async function login() {
    const user = document.getElementById("user").value;
    const pass = document.getElementById("pass").value;
    
    if(!navigator.onLine) {
        alert("Necesitas conexión a internet para el primer inicio de sesión.");
        return;
    }
    
    document.querySelector("#login-screen button").innerText = "Verificando...";
    
    try {
        const urlLogin = `${API_URL}?action=login&usuario=${user}&clave=${pass}`;
        
        const res = await fetch(urlLogin, {
            method: 'GET',
            redirect: 'follow' 
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentUser = user;
            localStorage.setItem("user", user);
            localStorage.setItem("rol", data.rol);
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("app-screen").classList.remove("hidden");
        } else {
            alert(data.error);
            document.querySelector("#login-screen button").innerText = "Ingresar";
        }
    } catch(err) {
        alert("Error de conexión con el servidor.");
        console.error("Detalle del error:", err);
        document.querySelector("#login-screen button").innerText = "Ingresar";
    }
}
// 4. Captura GPS Inalterable
let currentGPS = null;
function captureGPS() {
    document.getElementById("gps-data").innerText = "Buscando satélites...";
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            document.getElementById("gps-data").innerText = `Precisión lograda: Lat ${currentGPS.lat.toFixed(5)}, Lng ${currentGPS.lng.toFixed(5)}`;
        },
        (err) => {
            alert("Debes permitir el acceso al GPS para continuar.");
            document.getElementById("gps-data").innerText = "";
        },
        { enableHighAccuracy: true, maximumAge: 0 }
    );
}

// 5. Guardar Registro Localmente sin saturar la memoria del celular
async function saveRecord() {
    const idPoste = document.getElementById("id_poste").value;
    const file = document.getElementById("cameraInput").files[0];
    
    if (!idPoste) return alert("Falta el ID del Poste.");
    if (!currentGPS) return alert("Falta capturar la coordenada GPS.");
    if (!file) return alert("La fotografía es obligatoria.");
    
    // Creamos una referencia directa y ligera al archivo sin saturar la RAM
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
        // Liberamos la referencia temporal de memoria
        URL.revokeObjectURL(imageUrl);
        
        // Crear un lienzo temporal para reducir drásticamente el tamaño
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
        } else {
            if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Comprimir la imagen a JPG con calidad del 70% (Peso final menor a 150 KB)
        const fotoComprimidaBase64 = canvas.toDataURL("image/jpeg", 0.7);

        const record = {
            id_poste: idPoste.toUpperCase(),
            usuario: currentUser,
            latitud: currentGPS.lat,
            longitud: currentGPS.lng,
            timestamp: new Date().toISOString(),
            fotoBase64: fotoComprimidaBase64
        };
        
        const tx = db.transaction("registros", "readwrite");
        tx.objectStore("registros").add(record);
        tx.oncomplete = () => {
            alert("Inspección guardada exitosamente en el equipo.");
            document.getElementById("id_poste").value = "";
            document.getElementById("cameraInput").value = "";
            currentGPS = null;
            document.getElementById("gps-data").innerText = "";
            checkQueue();
        };
    };
    
    img.onerror = function() {
        URL.revokeObjectURL(imageUrl);
        alert("Error al procesar la imagen de la cámara. Intenta de nuevo.");
    };
    
    img.src = imageUrl;
}

// 6. Motor de Sincronización (Offline -> Online)
function checkQueue() {
    if (!db) return; // <-- Evita que colapse si la DB no está lista
    
    const tx = db.transaction("registros", "readonly");
    const store = tx.objectStore("registros");
    const request = store.getAll();
    request.onsuccess = () => {
        const records = request.result;
        document.getElementById("queue-count").innerText = records.length;
        if (records.length > 0 && navigator.onLine) {
            document.getElementById("btn-sync").classList.remove("hidden");
        } else {
            document.getElementById("btn-sync").classList.add("hidden");
        }
    };
}
async function syncData() {
    document.getElementById("btn-sync").innerText = "Enviando datos...";
    const tx = db.transaction("registros", "readonly");
    const request = tx.objectStore("registros").getAll();
    
    request.onsuccess = async () => {
        const records = request.result;
        if(records.length === 0) return;
        
        try {
            const res = await fetch(`${API_URL}?action=sync`, {
                method: 'POST',
                body: JSON.stringify({ data: records })
            });
            const data = await res.json();
            
            if (data.success) {
                const txDel = db.transaction("registros", "readwrite");
                txDel.objectStore("registros").clear();
                alert(`¡Sincronización exitosa! ${data.synced} registros enviados.`);
                checkQueue();
                document.getElementById("btn-sync").innerHTML = 'Sincronizar Pendientes (<span id="queue-count">0</span>)';
            }
        } catch(e) {
            alert("Fallo en red. Los datos siguen seguros en tu celular. Intenta cuando tengas mejor señal.");
            document.getElementById("btn-sync").innerHTML = 'Sincronizar Pendientes (<span id="queue-count">'+records.length+'</span>)';
        }
    };
}

// Activar PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
// Escuchadores activos de red para que el indicador cambie de inmediato
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Ejecutar la verificación inicial al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
});
// 7. Lector de Código QR con la Cámara del Celular
let html5QrCode = null;

function startQrScanner() {
    const readerDiv = document.getElementById("reader");
    readerDiv.classList.remove("hidden");
    
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }
    
    // Inicia la cámara trasera del celular en modo escaneo
    html5QrCode.start(
        { facingMode: "environment" }, 
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        (decodedText, decodedResult) => {
            // ¡Código leído con éxito!
            document.getElementById("id_poste").value = decodedText;
            alert("¡Código QR leído: " + decodedText + "!");
            stopQrScanner();
        },
        (errorMessage) => {
            // Errores de escaneo en tiempo real (se ignoran para no saturar)
        }
    ).catch((err) => {
        alert("No se pudo iniciar la cámara. Asegúrate de dar permisos en el navegador.");
        console.error(err);
        readerDiv.classList.add("hidden");
    });
}

function stopQrScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById("reader").classList.add("hidden");
        }).catch(err => {
            console.error("Error al detener la cámara", err);
        });
    }
}
