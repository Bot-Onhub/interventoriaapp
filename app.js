// ==========================================
// 1. CONFIGURACIÓN DE SERVIDORES Y APIS
// ==========================================
// Mantenemos Apps Script SOLO para el login
const API_URL_GAS = "https://script.google.com/macros/s/AKfycbwSOCQqsj_AaU2VLMGtYvlVlbG4mzBP4FmE0-XNflCss5f0bZpaOjTT2LKFaNaYMTrZ/exec?token=Macgregor281170";

// INYECTA AQUÍ TUS CREDENCIALES DE SUPABASE PARA GUARDAR DATOS
const SUPABASE_URL = "https://onxhuhjimbucnomwwcsn.supabase.co"; // Reemplaza con tu URL de Supabase
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueGh1aGppbWJ1Y25vbXd3Y3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MjYyMDksImV4cCI6MjEwMzUwMjIwOX0.mNYVLb6FZenWcJIy_k29lDWzFhB88SrI8v6tHPkrWsg"; // Reemplaza con tu Anon Key
const SUPABASE_TABLE = "registros_interventoria"; // Reemplaza con el nombre de tu tabla en Supabase

let db;
let currentUser = localStorage.getItem("user") || "";

// ==========================================
// 2. CONFIGURAR BASE DE DATOS OFFLINE (IndexedDB)
// ==========================================
const request = indexedDB.open("InterventoriaDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore("registros", { autoIncrement: true });
};
request.onsuccess = (e) => { 
    db = e.target.result; 
    checkQueue(); 
};

// ==========================================
// 3. CONTROL DE CONECTIVIDAD
// ==========================================
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
    const ind = document.getElementById("status-indicator");
    if (navigator.onLine) {
        ind.className = "text-xs px-2 py-1 bg-green-500 text-white rounded font-bold";
        ind.innerText = "Online";
        if (db) { checkQueue(); }
    } else {
        ind.className = "text-xs px-2 py-1 bg-red-500 text-white rounded font-bold";
        ind.innerText = "Offline";
    }
}

// ==========================================
// 4. SISTEMA DE LOGIN (Vía Google Apps Script)
// ==========================================
async function login() {
    const user = document.getElementById("user").value;
    const pass = document.getElementById("pass").value;
    
    if(!navigator.onLine) {
        alert("Necesitas conexión a internet para el primer inicio de sesión.");
        return;
    }
    
    document.querySelector("#login-screen button").innerText = "Verificando...";
    
    try {
        const urlLogin = `${API_URL_GAS}&action=login&usuario=${encodeURIComponent(user)}&clave=${encodeURIComponent(pass)}`;
        
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
            alert(data.error || "Credenciales incorrectas.");
            document.querySelector("#login-screen button").innerText = "Ingresar";
        }
    } catch(err) {
        alert("Error de conexión con el servidor de autenticación.");
        console.error("Detalle del error:", err);
        document.querySelector("#login-screen button").innerText = "Ingresar";
    }
}

// ==========================================
// 5. CAPTURA GPS INALTERABLE
// ==========================================
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

// ==========================================
// 6. GUARDAR REGISTRO LOCALMENTE (Incluye nuevos campos)
// ==========================================
async function saveRecord() {
    // Captura de variables originales
    const idPoste = document.getElementById("id_poste").value;
    const file = document.getElementById("cameraInput").files[0];
    
    // Captura de NUEVAS variables añadidas en el HTML
    const tipoActividad = document.getElementById("tipo_actividad")?.value || "";
    const sectorBarrio = document.getElementById("sector_barrio")?.value || "";
    const descripcionTrabajo = document.getElementById("descripcion_trabajo")?.value || "";
    
    // Validaciones estrictas
    if (!idPoste) return alert("Falta el ID del Poste.");
    if (!tipoActividad) return alert("Falta seleccionar el Tipo de Actividad.");
    if (!sectorBarrio) return alert("Falta escribir el Sector o Barrio.");
    if (!descripcionTrabajo) return alert("Falta la Descripción del trabajo.");
    if (!currentGPS) return alert("Falta capturar la coordenada GPS.");
    if (!file) return alert("La fotografía es obligatoria.");
    
    // Proceso de compresión de imagen
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
        URL.revokeObjectURL(imageUrl);
        
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

        const fotoComprimidaBase64 = canvas.toDataURL("image/jpeg", 0.7);

        // Estructura de datos alineada con las columnas de Supabase
        const record = {
            id_poste: idPoste.toUpperCase(),
            tipo_actividad: tipoActividad,
            sector_barrio: sectorBarrio,
            descripcion_trabajo: descripcionTrabajo,
            usuario: currentUser,
            latitud: currentGPS.lat,
            longitud: currentGPS.lng,
            timestamp: new Date().toISOString(),
            foto_base64: fotoComprimidaBase64 // Asegúrate que en Supabase la columna se llame foto_base64 (tipo text)
        };
        
        const tx = db.transaction("registros", "readwrite");
        tx.objectStore("registros").add(record);
        tx.oncomplete = () => {
            alert("Inspección guardada exitosamente en el equipo.");
            // Limpieza del formulario
            document.getElementById("id_poste").value = "";
            document.getElementById("tipo_actividad").value = "";
            document.getElementById("sector_barrio").value = "";
            document.getElementById("descripcion_trabajo").value = "";
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

// ==========================================
// 7. MOTOR DE SINCRONIZACIÓN HACIA SUPABASE (Offline -> Online)
// ==========================================
function checkQueue() {
    if (!db) return;
    
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
    document.getElementById("btn-sync").innerText = "Enviando a Supabase...";
    const tx = db.transaction("registros", "readonly");
    const request = tx.objectStore("registros").getAll();
    
    request.onsuccess = async () => {
        const records = request.result;
        if(records.length === 0) return;
        
        try {
            // Utilizamos la API REST de Supabase para inserción masiva (bulk insert)
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal' // Optimiza la respuesta del servidor
                },
                body: JSON.stringify(records) // Enviamos el array completo de registros
            });
            
            if (res.ok) {
                // Si Supabase responde 200-299, borramos los datos locales
                const txDel = db.transaction("registros", "readwrite");
                txDel.objectStore("registros").clear();
                
                alert(`¡Sincronización exitosa! ${records.length} registros enviados a la nube.`);
                checkQueue();
                document.getElementById("btn-sync").innerHTML = 'Sincronizar Pendientes (<span id="queue-count">0</span>)';
            } else {
                const errorData = await res.json();
                console.error("Error de Supabase:", errorData);
                alert("Error en la estructura de la base de datos de Supabase. Revisa la consola.");
                document.getElementById("btn-sync").innerHTML = 'Sincronizar Pendientes (<span id="queue-count">'+records.length+'</span>)';
            }
        } catch(e) {
            alert("Fallo en red. Los datos siguen seguros en tu celular. Intenta cuando tengas mejor señal.");
            console.error("Fallo de red:", e);
            document.getElementById("btn-sync").innerHTML = 'Sincronizar Pendientes (<span id="queue-count">'+records.length+'</span>)';
        }
    };
}

// ==========================================
// 8. LECTOR DE CÓDIGO QR Y SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
});

let html5QrCode = null;

function startQrScanner() {
    const readerDiv = document.getElementById("reader");
    readerDiv.classList.remove("hidden");
    
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }
    
    html5QrCode.start(
        { facingMode: "environment" }, 
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        (decodedText, decodedResult) => {
            document.getElementById("id_poste").value = decodedText;
            alert("¡Código QR leído: " + decodedText + "!");
            stopQrScanner();
        },
        (errorMessage) => {
            // Ignorar errores silenciosos del escáner
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
