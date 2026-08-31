// ==========================================
// 1. CONFIGURACIÓN DE SERVIDORES Y APIS
// ==========================================
const SUPABASE_URL = "https://onxhuhjimbucnomwwcsn.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueGh1aGppbWJ1Y25vbXd3Y3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MjYyMDksImV4cCI6MjEwMzUwMjIwOX0.mNYVLb6FZenWcJIy_k29lDWzFhB88SrI8v6tHPkrWsg"; 
const SUPABASE_TABLE = "registros_interventoria"; 

let db;
let currentUser = localStorage.getItem("user") || "";

const getSupabaseToken = () => localStorage.getItem("supabase_access_token");

// ==========================================
// 2. CONFIGURAR BASE DE DATOS OFFLINE (IndexedDB)
// ==========================================
const request = indexedDB.open("InterventoriaDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("registros")) {
        db.createObjectStore("registros", { keyPath: "id", autoIncrement: true });
    }
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
    if (!ind) return;
    if (navigator.onLine) {
        ind.style.background = "#059669";
        ind.innerText = "Online";
        if (db) { checkQueue(); }
    } else {
        ind.style.background = "#dc2626";
        ind.innerText = "Offline";
    }
}

// ==========================================
// 4. SISTEMA DE LOGIN (Vía Supabase Auth)
// ==========================================
async function login() {
    const email = document.getElementById("user").value;
    const pass = document.getElementById("pass").value;
    
    if(!navigator.onLine) {
        alert("Necesitas conexión a internet para el primer inicio de sesión.");
        return;
    }
    
    const btnLogin = document.querySelector("#login-screen button");
    if(btnLogin) btnLogin.innerText = "Verificando en Supabase...";
    
    try {
        const urlLogin = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
        
        const res = await fetch(urlLogin, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ email: email, password: pass })
        });
        
        const data = await res.json();
        
        if (res.ok && data.access_token) {
            currentUser = email;
            // NUEVO: Capturar el municipio desde los metadatos del usuario en Supabase
            const userMunicipio = (data.user && data.user.user_metadata && data.user.user_metadata.municipio) 
                                   ? data.user.user_metadata.municipio 
                                   : "General";
            
            localStorage.setItem("user", email);
            localStorage.setItem("supabase_access_token", data.access_token);
            localStorage.setItem("municipio", userMunicipio); // Guardamos el tenant
            
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("app-screen").classList.remove("hidden");
            
            setTimeout(() => {
                if (mapInstance) {
                    mapInstance.invalidateSize();
                } else {
                    initMapFromLocal();
                }
            }, 300);
        } else {
            alert(data.error_description || "Credenciales incorrectas.");
            if(btnLogin) btnLogin.innerText = "Ingresar al Sistema";
        }
    } catch(err) {
        alert("Error de conexión con el servidor de autenticación.");
        console.error("Detalle del error:", err);
        if(btnLogin) btnLogin.innerText = "Ingresar al Sistema";
    }
}

// ==========================================
// 5. CAPTURA GPS INALTERABLE
// ==========================================
let currentGPS = null;
function captureGPS() {
    const gpsData = document.getElementById("gps-data");
    if(gpsData) gpsData.innerText = "Buscando satélites...";
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if(gpsData) gpsData.innerText = `Precisión lograda: Lat ${currentGPS.lat.toFixed(5)}, Lng ${currentGPS.lng.toFixed(5)}`;
        },
        (err) => {
            alert("Debes permitir el acceso al GPS para continuar.");
            if(gpsData) gpsData.innerText = "GPS no capturado";
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

// ==========================================
// 6. GUARDAR REGISTRO LOCALMENTE
// ==========================================
async function saveRecord() {
    const idPoste = document.getElementById("id_poste").value;
    const file = document.getElementById("cameraInput").files[0];
    
    const tipoActividad = document.getElementById("tipo_actividad")?.value || "";
    const estadoIncidencia = document.getElementById("estado_incidencia")?.value || "";
    const sectorBarrio = document.getElementById("sector_barrio")?.value || "";
    const descripcionTrabajo = document.getElementById("descripcion_trabajo")?.value || "";
    
    if (!idPoste) return alert("Falta el ID del Poste.");
    if (!tipoActividad) return alert("Falta seleccionar el Tipo de Actividad.");
    if (!estadoIncidencia) return alert("Falta seleccionar el Estado Operativo.");
    if (!sectorBarrio) return alert("Falta escribir el Sector o Barrio.");
    if (!descripcionTrabajo) return alert("Falta la Descripción del trabajo.");
    if (!currentGPS) return alert("Falta capturar la coordenada GPS.");
    if (!file) return alert("La fotografía es obligatoria.");
    
    if (!db) {
        alert("La base de datos local no está lista. Recarga la página.");
        return;
    }
    
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
        URL.revokeObjectURL(imageUrl);
        
        const canvas = .createElement("canvas");
        const MAX_WIDTH = 1000; 
        const MAX_HEIGHT = 1000;
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

        const altoPanel = 70;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; 
        ctx.fillRect(0, height - altoPanel, width, altoPanel);

        ctx.fillStyle = "white";
        ctx.font = "bold 16px Arial, sans-serif";
        const fechaActual = new Date().toLocaleString("es-CO");
        
        ctx.fillText(`POSTE: ${idPoste.toUpperCase()} | FECHA: ${fechaActual}`, 15, height - 42);
        ctx.fillText(`GPS: Lat ${currentGPS.lat.toFixed(5)}, Lon ${currentGPS.lng.toFixed(5)} | TÉCNICO: ${currentUser}`, 15, height - 17);

        const fotoComprimidaBase64 = canvas.toDataURL("image/jpeg", 0.8);

        const record = {
            id_poste: idPoste.toUpperCase(),
            tipo_actividad: tipoActividad,
            estado_incidencia: estadoIncidencia,
            sector_barrio: sectorBarrio,
            descripcion_trabajo: descripcionTrabajo,
            usuario: currentUser,
            municipio: tenantActual, // <--- NUEVO: Queda sellado con el municipio
            latitud: currentGPS.lat,
            longitud: currentGPS.lng,
            timestamp: new Date().toISOString(),
            foto_base64: fotoComprimidaBase64
        };
        
        try {
            const tx = db.transaction("registros", "readwrite");
            const store = tx.objectStore("registros");
            store.add(record);
            
            tx.oncomplete = () => {
                alert("Inspección guardada exitosamente en el equipo.");
                document.getElementById("id_poste").value = "";
                document.getElementById("tipo_actividad").value = "";
                document.getElementById("estado_incidencia").value = "OPERATIVA";
                document.getElementById("sector_barrio").value = "";
                document.getElementById("descripcion_trabajo").value = "";
                document.getElementById("cameraInput").value = "";
                currentGPS = null;
                const gpsData = document.getElementById("gps-data");
                if(gpsData) gpsData.innerText = "GPS no capturado";
                checkQueue();
                initMapFromLocal(); 
            };

            tx.onerror = (e) => {
                console.error("Error en transacción IndexedDB:", e);
                alert("Error al guardar localmente en el equipo.");
            };
        } catch (err) {
            console.error("Error crítico abriendo transacción:", err);
            alert("Error al intentar escribir en la base de datos local.");
        }
    };    
    
    img.onerror = function() {
        URL.revokeObjectURL(imageUrl);
        alert("Error al procesar la imagen de la cámara. Intenta de nuevo.");
    };
    
    img.src = imageUrl;
}

// ==========================================
// 7. MOTOR DE SINCRONIZACIÓN ATÓMICA HACIA SUPABASE
// ==========================================
function checkQueue() {
    if (!db) return;
    
    const tx = db.transaction("registros", "readonly");
    const store = tx.objectStore("registros");
    const req = store.getAll();
    req.onsuccess = () => {
        const records = req.result;
        const queueCount = .getElementById("queue-count");
        const btnSync = .getElementById("btn-sync");
        
        if(queueCount) queueCount.innerText = records.length;
        
        if (records.length > 0 && navigator.onLine) {
            if(btnSync) btnSync.classList.remove("hidden");
        } else {
            if(btnSync) btnSync.classList.add("hidden");
        }
        
        initMapFromLocal(records);
    };
}

function initMapFromLocal(registrosForzados = null) {
    if (!db) return;
    if (registrosForzados) {
        initMap(registrosForzados);
        return;
    }
    const tx = db.transaction("registros", "readonly");
    const store = tx.objectStore("registros");
    const req = store.getAll();
    req.onsuccess = () => {
        initMap(req.result);
    };
}

async function syncData() {
    const token = getSupabaseToken();
    if (!token) {
        alert("Error: Sesión no válida. Cierra sesión y vuelve a ingresar.");
        return;
    }

    const btnSync = .getElementById("btn-sync");
    if(btnSync) btnSync.innerText = "Sincronizando...";
    
    const tx = db.transaction("registros", "readonly");
    const store = tx.objectStore("registros");
    const req = store.getAll();
    
    req.onsuccess = async () => {
        const records = req.result;
        if(records.length === 0) return;
        
        let sincronizadosExitosamente = 0;

        try {
            for (let record of records) {
                let rutaInternaFoto = "";

                if (record.foto_base64) {
                    const blobFoto = dataURLtoBlob(record.foto_base64);
                    const nombreArchivo = `inspecciones/${record.usuario.split('@')[0]}_${Date.now()}_${record.id_poste}.jpg`;

                    const resStorage = await fetch(`${SUPABASE_URL}/storage/v1/object/evidencias-inspeccion/${nombreArchivo}`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'image/jpeg',
                            'x-upsert': 'true'
                        },
                        body: blobFoto
                    });

                    if (!resStorage.ok) {
                        const errorText = await resStorage.text();
                        console.error("ERROR DE STORAGE:", errorText);
                        throw new Error("No se pudo subir la foto por restricciones de seguridad (RLS).");
                    }
                    
                    rutaInternaFoto = nombreArchivo; 
                }

                const datosParaEnviar = {
                    id_poste: record.id_poste,
                    tipo_actividad: record.tipo_actividad,
                    estado_incidencia: record.estado_incidencia || "OPERATIVA",
                    sector_barrio: record.sector_barrio,
                    descripcion_trabajo: record.descripcion_trabajo,
                    usuario: record.usuario,
                    municipio: record.municipio, // <--- NUEVO: Se envía a Supabase
                    latitud: record.latitud,
                    longitud: record.longitud,
                    timestamp: record.timestamp,
                    foto_base64: rutaInternaFoto
                };

                const resDb = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${token}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(datosParaEnviar)
                });

                if (!resDb.ok) {
                    throw new Error("Error al insertar el registro. Verifica permisos RLS en la tabla.");
                }

                await new Promise((resolve, reject) => {
                    const txDel = db.transaction("registros", "readwrite");
                    const storeDel = txDel.objectStore("registros");
                    const delReq = storeDel.delete(record.id);
                    txDel.oncomplete = () => resolve();
                    txDel.onerror = (e) => reject(e);
                });

                sincronizadosExitosamente++;
            }
            
            alert(`¡Sincronización segura exitosa! Se subieron ${sincronizadosExitosamente} registros.`);
            checkQueue();
            if(btnSync) btnSync.innerHTML = 'Sincronizar Pendientes (<span id="queue-count">0</span>)';

        } catch(e) {
            console.error("Detalle del fallo de red durante sincronización:", e);
            alert(`Sincronización interrumpida: ${e.message}. Se subieron ${sincronizadosExitosamente} registros.`);
            checkQueue();
            if(btnSync) btnSync.innerHTML = 'Sincronizar Pendientes (<span id="queue-count">...</span>)';
        }
    };
}

function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

// ==========================================
// 8. LECTOR DE CÓDIGO QR Y SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
    
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const token = localStorage.getItem("supabase_access_token");
    const user = localStorage.getItem("user");

    if (token && user) {
        // Si ya hay una sesión activa guardada
        if (loginScreen) loginScreen.classList.add("hidden");
        if (appScreen) appScreen.classList.remove("hidden");
        setTimeout(() => initMapFromLocal(), 500);
    } else {
        // Si NO hay sesión, forzamos obligatoriamente que se muestre el login
        if (loginScreen) loginScreen.classList.remove("hidden");
        if (appScreen) appScreen.classList.add("hidden");
    }
});
let html5QrCode = null;

function startQrScanner() {
    const readerDiv = document.getElementById("reader");
    if(readerDiv) readerDiv.classList.remove("hidden");
    
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
            const inputPoste = document.getElementById("id_poste");
            if(inputPoste) inputPoste.value = decodedText;
            alert("¡Código QR leído: " + decodedText + "!");
            stopQrScanner();
        },
        (errorMessage) => {}
    ).catch((err) => {
        alert("No se pudo iniciar la cámara. Asegúrate de dar permisos en el navegador.");
        console.error(err);
        if(readerDiv) readerDiv.classList.add("hidden");
    });
}

function stopQrScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            const readerDiv = document.getElementById("reader");
            if(readerDiv) readerDiv.classList.add("hidden");
        }).catch(err => {
            console.error("Error al detener la cámara", err);
        });
    }
}

let mapInstance = null;
let markersLayer = null;

function initMap(registros = []) {
    if (!mapInstance) {
        mapInstance = L.map('map').setView([6.168, -75.591], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);
        markersLayer = L.layerGroup().addTo(mapInstance);
    } else {
        markersLayer.clearLayers();
    }

    let bounds = [];

    registros.forEach(reg => {
        if (reg.latitud && reg.longitud) {
            const latLng = [reg.latitud, reg.longitud];
            bounds.push(latLng);

            const popupContent = `
                <div style="font-size: 0.85rem; padding: 4px;">
                    <b>Poste:</b> ${reg.id_poste}<br>
                    <b>Actividad:</b> ${reg.tipo_actividad}<br>
                    <b>Estado:</b> ${reg.estado_incidencia || 'N/A'}<br>
                    <b>Sector:</b> ${reg.sector_barrio}<br>
                    <b>Técnico:</b> ${reg.usuario}<br>
                    ${reg.foto_base64 ? `<img src="${reg.foto_base64}" style="width: 120px; height: auto; border-radius: 4px; margin-top: 5px;">` : ''}
                </div>
            `;

            L.marker(latLng)
                .addTo(markersLayer)
                .bindPopup(popupContent);
        }
    });

    if (bounds.length > 0) {
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
}
