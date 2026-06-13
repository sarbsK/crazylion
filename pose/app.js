/**
 * PoseStudio 3D - Application Logic Engine
 * Uses Three.js to construct a hierarchical anatomical mannequin,
 * interactive 3D raycasting, lighting studio controls, and pose presets.
 */

// Global Application State
const state = {
  // Reference Gallery selected style filter
  selectedStyle: 'all',
  includeArtisticNudes: true,
  
  // Scene objects
  scene: null,
  camera: null,
  renderer: null,
  orbitControls: null,
  transformControls: null,   // 3D manipulator gizmo
  manipulatorMode: 'rotate',    // 'off' | 'rotate' | 'translate'
  jointScales: {},
  
  // Lights
  ambientLight: null,
  keyLight: null,
  rimLight: null,
  
  // Ground grid and shadow plane
  gridHelper: null,
  shadowPlane: null,
  
  // Mannequin elements
  mannequinGroup: null, // Parent group for the entire character
  joints: {},           // Maps jointName -> THREE.Group
  jointSpheres: [],     // Array of meshes used for 3D raycasting/click detection
  limbs: [],            // Array of visual limb meshes (can be toggled)
  shadowOverlays: [],   // Array of transparent shadow-receiving overlays for Matcaps
  skeletonLines: null,  // Group containing skeletal wireframe helper lines
  
  // Custom Model elements
  customModel: null,
  customShadowOverlays: [],
  mannequinVisible: true,
  
  // Selection
  selectedJointName: 'pelvis',
  hoveredJointSphere: null,
  selectionOutlines: [],
  
  // Display toggles
  shadowsEnabled: true,
  meshVisible: true,
  skeletonVisible: false,
  gridVisible: true,
  
  // Lighting studio parameters
  lightIntensity: 1.2,
  lightAzimuth: 45,
  lightElevation: 30,
  lightColor: '#ffffff',
  rimIntensity: 1.5,
  rimColor: '#06b6d4',
  
  // Camera parameters
  cameraFov: 50,
  
  // Anatomy Proportions parameters
  anatomy: {
    torsoHeight: 1.0,
    torsoWidth: 1.0,
    chestWidth: 1.0,
    pelvisWidth: 1.0,
    pelvisTilt: 0,
    armLength: 1.0,
    legLength: 1.0,
    limbThickness: 1.0,
    headScale: 1.0
  },
  customSkinLoaded: false
};

// Skeletal Joint Configuration
// Structure defining coordinates of joints relative to their parent groups.
// This allows nested, hierarchical relative positioning.
const jointStructure = {
  name: 'pelvis',
  posY: 4.9, // Grounded root pelvis height (feet will rest exactly at Y = 0)
  meshSize: [1.8, 1.0, 1.3], // Proportional pelvic bowl
  children: [
    // Spine Column (Pivot sits at the bottom waist and extends UPWARD)
    {
      name: 'spine',
      posY: 1.0, // Joint sits at top of pelvis
      meshSize: [0.8, 1.2, 0.8], // Slender lumbar spine
      children: [
        // Chest Rib Cage (Pivot sits at the base of the ribcage and extends UPWARD)
        {
          name: 'chest',
          posY: 1.2, // Joint sits at top of spine column
          meshSize: [2.0, 1.5, 1.2], // Thoracic egg
          children: [
            // Neck Column (Pivot sits at C7 base and extends UPWARD)
            {
              name: 'neck',
              posY: 1.5, // Joint sits at top of chest
              meshSize: [0.4, 0.5, 0.4], // Slender neck column
              children: [
                // Head (Skull base sits exactly at the top of the neck joint)
                {
                  name: 'head',
                  posY: 0.5, // Joint sits at top of neck
                  meshSize: [1.1, 1.4, 1.1] // Sleek skull & jaw structure
                }
              ]
            },
            // Left Arm (Shoulder pivot is situated laterally in the upper chest)
            {
              name: 'leftUpperArm',
              posX: -1.2,
              posY: 1.2,
              posZ: 0,
              meshSize: [0.55, 1.8, 0.55], // Tapered upper arm
              children: [
                {
                  name: 'leftForearm',
                  posY: -1.8, // Distance down from shoulder to elbow
                  meshSize: [0.45, 1.6, 0.45], // Tapered forearm
                  children: [
                    {
                      name: 'leftHand',
                      posY: -1.6,
                      meshSize: [0.35, 0.5, 0.45] // Palm block
                    }
                  ]
                }
              ]
            },
            // Right Arm (Shoulder pivot is situated laterally in the upper chest)
            {
              name: 'rightUpperArm',
              posX: 1.2,
              posY: 1.2,
              posZ: 0,
              meshSize: [0.55, 1.8, 0.55],
              children: [
                {
                  name: 'rightForearm',
                  posY: -1.8,
                  meshSize: [0.45, 1.6, 0.45],
                  children: [
                    {
                      name: 'rightHand',
                      posY: -1.6,
                      meshSize: [0.35, 0.5, 0.45]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    // Left Leg (Hip pivot is situated laterally in the lower pelvis)
    {
      name: 'leftThigh',
      posX: -0.8,
      posY: 0.2, // Joint sits inside lower third of pelvis bowl
      posZ: 0,
      meshSize: [0.9, 2.4, 0.9], // Muscle-tapered thigh
      children: [
        {
          name: 'leftCalf',
          posY: -2.4, // Distance down from hip to knee hinge
          meshSize: [0.8, 2.2, 0.8], // Gastrocnemius-swept calf
          children: [
            {
              name: 'leftFoot',
              posY: -2.2,
              meshSize: [0.7, 0.5, 1.4] // Wedge foot extends forward
            }
          ]
        }
      ]
    },
    // Right Leg (Hip pivot is situated laterally in the lower pelvis)
    {
      name: 'rightThigh',
      posX: 0.8,
      posY: 0.2,
      posZ: 0,
      meshSize: [0.9, 2.4, 0.9],
      children: [
        {
          name: 'rightCalf',
          posY: -2.4,
          meshSize: [0.8, 2.2, 0.8],
          children: [
            {
              name: 'rightFoot',
              posY: -2.2,
              meshSize: [0.7, 0.5, 1.4]
            }
          ]
        }
      ]
    }
  ]
};

// Mannequin Clay Color Palette & Shading Material
const materials = {
  // Current active mannequin material, will point to one of the presets
  mannequinLimb: new THREE.MeshStandardMaterial({
    color: 0xdfdcd6,       // Alabaster plaster default
    roughness: 0.35,
    metalness: 0.05,
    flatShading: false
  }),
  
  // High-end material presets
  presets: {
    alabaster: {
      color: 0xdfdcd6,
      roughness: 0.35,
      metalness: 0.05
    },
    terracotta: {
      color: 0xc87a53,      // Traditional baked red-clay terracotta
      roughness: 0.85,
      metalness: 0.02
    },
    obsidian: {
      color: 0x111115,      // Dark reflective volcanic glass
      roughness: 0.15,
      metalness: 0.95
    },
    jade: {
      color: 0x4d7c5a,      // Soft polished jade green
      roughness: 0.25,
      metalness: 0.1
    }
  },

  // Selection indicators (styled as elegant dark chrome pin hinges)
  jointDefault: new THREE.MeshStandardMaterial({
    color: 0x27272a,       // Dark obsidian steel
    roughness: 0.2,
    metalness: 0.8
  }),
  jointHover: new THREE.MeshStandardMaterial({
    color: 0x06b6d4,       // Glowing electric cyan
    roughness: 0.2,
    metalness: 0.8
  }),
  jointSelected: new THREE.MeshStandardMaterial({
    color: 0xf59e0b,       // Glowing warm amber gold
    roughness: 0.2,
    metalness: 0.8
  }),
  
  // Loomis Head details
  loomisLine: new THREE.LineBasicMaterial({
    color: 0x374151,
    linewidth: 2
  })
};

// Procedural Matcap Texture Generator
// Generates a beautiful 256x256 pre-shaded clay sphere on an offscreen canvas.
// This completely avoids local browser CORS file loading restrictions.
function generateProceduralMatcap(clayType) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(256, 256);
  
  let rBase = 185, gBase = 100, bBase = 75; // Terracotta clay red
  if (clayType === 'grey') {
    rBase = 115; gBase = 118; bBase = 122; // Professional grey plastilina
  } else if (clayType === 'white') {
    rBase = 225; gBase = 222; bBase = 218; // Fine plaster/alabaster
  } else if (clayType === 'jade') {
    rBase = 70; gBase = 135; bBase = 95; // Deep polished jade
  } else if (clayType === 'bronze') {
    rBase = 160; gBase = 110; bBase = 55; // Museum bronze
  }

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const dx = (x - 128) / 128;
      const dy = (128 - y) / 128;
      const r2 = dx * dx + dy * dy;
      
      if (r2 <= 1.0) {
        const nz = Math.sqrt(1.0 - r2);
        const nx = dx;
        const ny = dy;
        
        // Multi-directional sculpture lighting rig (ideal for detailing forms)
        // 1. Key light from top-right-front
        const kx = 0.577, ky = 0.577, kz = 0.577;
        const ndotk = nx * kx + ny * ky + nz * kz;
        const diffuseKey = Math.max(0.0, ndotk);
        
        // 2. Fill light from left-bottom
        const fx = -0.707, fy = -0.707, fz = 0.0;
        const ndotf = nx * fx + ny * fy + nz * fz;
        const diffuseFill = Math.max(0.0, ndotf);
        
        // 3. Rim contour light from top-left-back
        const rx = -0.577, ry = 0.577, rz = -0.577;
        const ndotr = nx * rx + ny * ry + nz * rz;
        const rim = Math.pow(1.0 - nz, 3.5) * Math.max(0.0, ndotr);
        
        // Shading blends
        let r = rBase * (0.35 + 0.65 * diffuseKey);
        let g = gBase * (0.35 + 0.65 * diffuseKey);
        let b = bBase * (0.35 + 0.65 * diffuseKey);
        
        // Shadow tone (cooler, ambient feel)
        r += 15 * diffuseFill;
        g += 25 * diffuseFill;
        b += 40 * diffuseFill;
        
        // Specular highlight
        let specPower = 15.0;
        let specIntensity = 30;
        if (clayType === 'jade') {
          specPower = 35.0;
          specIntensity = 50;
        } else if (clayType === 'bronze') {
          specPower = 25.0;
          specIntensity = 70;
        }
        const spec = Math.pow(diffuseKey, specPower);
        r += specIntensity * spec;
        g += specIntensity * spec;
        b += specIntensity * spec;
        
        // Rim light glow
        if (clayType === 'jade') {
          r += 40 * rim; g += 90 * rim; b += 70 * rim;
        } else {
          r += 50 * rim; g += 50 * rim; b += 50 * rim;
        }
        
        imgData.data[idx] = Math.min(255, r);
        imgData.data[idx+1] = Math.min(255, g);
        imgData.data[idx+2] = Math.min(255, b);
        imgData.data[idx+3] = 255;
      } else {
        imgData.data[idx] = 0;
        imgData.data[idx+1] = 0;
        imgData.data[idx+2] = 0;
        imgData.data[idx+3] = 0;
      }
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Pre-generate Matcap materials for instant swapping
materials.matcaps = {
  clay_red: new THREE.MeshMatcapMaterial({ matcap: generateProceduralMatcap('terracotta') }),
  clay_grey: new THREE.MeshMatcapMaterial({ matcap: generateProceduralMatcap('grey') }),
  clay_white: new THREE.MeshMatcapMaterial({ matcap: generateProceduralMatcap('white') }),
  clay_jade: new THREE.MeshMatcapMaterial({ matcap: generateProceduralMatcap('jade') }),
  clay_bronze: new THREE.MeshMatcapMaterial({ matcap: generateProceduralMatcap('bronze') })
};

// Initialize Application
function init() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  // 1. Setup Scene, Camera, Renderer
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x0e0e12);
  state.scene.fog = new THREE.FogExp2(0x0e0e12, 0.015);

  state.camera = new THREE.PerspectiveCamera(state.cameraFov, container.clientWidth / container.clientHeight, 0.1, 100);
  
  state.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  state.renderer.setSize(container.clientWidth, container.clientHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.0;
  container.appendChild(state.renderer.domElement);

  // 2. Setup Camera Controls
  state.orbitControls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
  state.orbitControls.enableDamping = true;
  state.orbitControls.dampingFactor = 0.05;
  state.orbitControls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit panning under the floor
  state.orbitControls.minDistance = 3;
  state.orbitControls.maxDistance = 25;
  
  // Set default starting camera view
  resetCameraToThreeQuarters();

  // 3. Build Environmental Foundations
  setupEnvironment();

  // 4. Assemble the Hierarchical 3D Mannequin
  state.mannequinGroup = new THREE.Group();
  state.scene.add(state.mannequinGroup);
  
  buildMannequinHierarchy(jointStructure, state.mannequinGroup);
  
  // 5. Connect UI Controllers and Events
  setupLightingStudio();
  setupUIEventListeners();
  setup3DRaycasting();

  // 6. Initialize 3D Manipulator (TransformControls)
  if (typeof THREE.TransformControls !== 'undefined') {
    state.transformControls = new THREE.TransformControls(state.camera, state.renderer.domElement);
    state.transformControls.setMode('rotate');
    state.transformControls.setSize(1.1);
    state.transformControls.setSpace('local');  // Rotate in local (joint) space
    state.transformControls.visible = false;
    state.scene.add(state.transformControls);

    // Disable orbit while dragging the gizmo
    state.transformControls.addEventListener('dragging-changed', (evt) => {
      state.orbitControls.enabled = !evt.value;
      if (!evt.value) {
        // Dragging ended! Trigger auto-match pose!
        triggerAutoMatchPose();
      }
    });

    // Sync sliders when manipulator moves the joint
    state.transformControls.addEventListener('objectChange', () => {
      const jointGroup = state.joints[state.selectedJointName];
      if (!jointGroup) return;
      const rotX = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.x));
      const rotY = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.y));
      const rotZ = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.z));
      updateSliderState('rotate-x', rotX);
      updateSliderState('rotate-y', rotY);
      updateSliderState('rotate-z', rotZ);
      if (state.skeletonVisible) drawSkeletonLines();
    });
  }

  // 6. Set initial standing neutral pose or URL-specified pose
  const urlParams = new URLSearchParams(window.location.search);
  const poseParam = urlParams.get('pose');
  if (poseParam && poseDatabase[poseParam]) {
    applyPresetPose(poseParam);
    const btnId = 'preset-' + poseParam;
    const presetBtn = document.getElementById(btnId);
    if (presetBtn) {
      document.querySelectorAll('.btn-grid button').forEach(b => b.classList.remove('active'));
      presetBtn.classList.add('active');
    }
  } else {
    applyPresetPose('neutral');
  }

  // Initialize anatomy proportions solver
  updateMannequinProportions();
  
  // Set default starting material from the dropdown (Traditional Red Clay Matcap)
  document.getElementById('material-selector').dispatchEvent(new Event('change'));
  
  // 7. Setup Collapsible Sidebar Sections
  const sections = document.querySelectorAll('.sidebar .section');
  sections.forEach((sec, idx) => {
    const title = sec.querySelector('.section-title');
    if (!title) return;
    
    // Auto-collapse all panels except the first one (Pose Presets) on mobile screens on load
    if (window.innerWidth <= 768 && idx > 0) {
      sec.classList.add('collapsed');
    }
    
    title.addEventListener('click', () => {
      sec.classList.toggle('collapsed');
    });
  });

  // 7b. Mobile Sliding Drawer Controls (Toggle & Tap-outside-to-dismiss)
  const sidebar = document.getElementById('main-sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const closeBtn = document.getElementById('btn-close-sidebar');
  
  if (sidebar && closeBtn) {
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.add('open');
      });
    }
    
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.remove('open');
      const floatingLogoHeader = document.getElementById('floating-logo-header');
      if (floatingLogoHeader) floatingLogoHeader.style.display = 'flex';
    });
    
    // Smooth dismiss on tapping outside the sidebar drawer on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        // Dismiss main sidebar
        if (sidebar.classList.contains('open')) {
          if (!sidebar.contains(e.target) && (!toggleBtn || (e.target !== toggleBtn && !toggleBtn.contains(e.target)))) {
            sidebar.classList.remove('open');
            const floatingLogoHeader = document.getElementById('floating-logo-header');
            if (floatingLogoHeader) floatingLogoHeader.style.display = 'flex';
          }
        }
        
        // Dismiss reference sidebar
        const appInterface = document.querySelector('.app-interface');
        if (appInterface && appInterface.classList.contains('has-reference-sidebar')) {
          const refSidebar = document.getElementById('reference-sidebar');
          const btnSearchRef = document.getElementById('btn-search-reference');
          const btnFloatingSearch = document.getElementById('btn-floating-search');
          if (refSidebar && !refSidebar.contains(e.target) && 
              e.target !== btnSearchRef && !btnSearchRef.contains(e.target) &&
              (!btnFloatingSearch || (e.target !== btnFloatingSearch && !btnFloatingSearch.contains(e.target)))) {
            appInterface.classList.remove('has-reference-sidebar');
          }
        }
      }
    });
  }

  // 8. Start Render Animation Loop
  animate();
  
  // Initialize scale slider config on startup
  const optionJoint = document.querySelector('#scale-mode-selector option[value="joint"]');
  if (optionJoint) optionJoint.disabled = true;

  const scaleSelector = document.getElementById('scale-mode-selector');
  if (scaleSelector) {
    scaleSelector.value = 'torsoHeight'; // Default anatomy option
  }
  updateBottomScaleSliderConfig();

  // Adjust to viewport size changes
  window.addEventListener('resize', onWindowResize);
}

// -------------------------------------------------------------
// ENVIRONMENT & LIGHTING SETUP
// -------------------------------------------------------------

function setupEnvironment() {
  // Grid Floor
  state.gridHelper = new THREE.GridHelper(30, 30, 0x475569, 0x1e293b);
  state.gridHelper.position.y = 0;
  state.scene.add(state.gridHelper);

  // Shadow plane
  const planeGeo = new THREE.PlaneGeometry(60, 60);
  const planeMat = new THREE.ShadowMaterial({ opacity: 0.4 });
  state.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
  state.shadowPlane.rotation.x = -Math.PI / 2;
  state.shadowPlane.position.y = -0.01;
  state.shadowPlane.receiveShadow = true;
  state.scene.add(state.shadowPlane);

  // Ambient Soft Fill Light
  state.ambientLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.4);
  state.scene.add(state.ambientLight);

  // Directional Key Light (Sun/Spotlight)
  state.keyLight = new THREE.DirectionalLight(0xffffff, state.lightIntensity);
  state.keyLight.castShadow = true;
  
  // Configure Shadows
  state.keyLight.shadow.mapSize.width = 2048;
  state.keyLight.shadow.mapSize.height = 2048;
  state.keyLight.shadow.camera.near = 0.5;
  state.keyLight.shadow.camera.far = 40;
  const shadowBound = 10;
  state.keyLight.shadow.camera.left = -shadowBound;
  state.keyLight.shadow.camera.right = shadowBound;
  state.keyLight.shadow.camera.top = shadowBound;
  state.keyLight.shadow.camera.bottom = -shadowBound;
  state.keyLight.shadow.bias = -0.0005;
  state.scene.add(state.keyLight);

  // Rim Light (Placed behind the character, no shadow, pure glowing edge)
  state.rimLight = new THREE.DirectionalLight(state.rimColor, state.rimIntensity);
  state.scene.add(state.rimLight);
}

function updateKeyLightPosition() {
  // Translate Spherical Azimuth & Elevation to Cartesian Coordinates
  const radius = 15;
  const radAz = (state.lightAzimuth * Math.PI) / 180;
  const radEl = (state.lightElevation * Math.PI) / 180;

  state.keyLight.position.x = radius * Math.cos(radEl) * Math.sin(radAz);
  state.keyLight.position.y = radius * Math.sin(radEl);
  state.keyLight.position.z = radius * Math.cos(radEl) * Math.cos(radAz);
  
  // Keep key light focused on center of mannequin (approx chest height = 4.2)
  state.keyLight.target.position.set(0, 4.2, 0);
  state.keyLight.target.updateMatrixWorld();

  // Position Rim Light directly opposite to Key Light to accentuate contour edges
  state.rimLight.position.x = -state.keyLight.position.x;
  state.rimLight.position.y = radius * 0.4; // Keep rim light somewhat lower for artistic halos
  state.rimLight.position.z = -state.keyLight.position.z;
}

function setupLightingStudio() {
  updateKeyLightPosition();
  
  // UI Shadows Toggle
  document.getElementById('toggle-shadows').addEventListener('change', (e) => {
    state.shadowsEnabled = e.target.checked;
    state.keyLight.castShadow = state.shadowsEnabled;
    state.shadowPlane.visible = state.shadowsEnabled;
  });

  // UI Key Light Intensity
  const lightInt = document.getElementById('light-intensity');
  const lightIntVal = document.getElementById('light-intensity-val');
  lightInt.addEventListener('input', (e) => {
    state.lightIntensity = parseFloat(e.target.value);
    state.keyLight.intensity = state.lightIntensity;
    lightIntVal.innerText = state.lightIntensity.toFixed(1);
  });

  // UI Light Azimuth
  const lightAz = document.getElementById('light-azimuth');
  const lightAzVal = document.getElementById('light-azimuth-val');
  lightAz.addEventListener('input', (e) => {
    state.lightAzimuth = parseInt(e.target.value);
    updateKeyLightPosition();
    lightAzVal.innerText = state.lightAzimuth + '°';
  });

  // UI Light Elevation
  const lightEl = document.getElementById('light-elevation');
  const lightElVal = document.getElementById('light-elevation-val');
  lightEl.addEventListener('input', (e) => {
    state.lightElevation = parseInt(e.target.value);
    updateKeyLightPosition();
    lightElVal.innerText = state.lightElevation + '°';
  });

  // Key Light Color Selection
  document.querySelectorAll('[data-color]').forEach(dot => {
    dot.addEventListener('click', (e) => {
      document.querySelectorAll('[data-color]').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.lightColor = dot.getAttribute('data-color');
      state.keyLight.color.set(state.lightColor);
    });
  });

  // Rim Light Intensity
  const rimInt = document.getElementById('rim-intensity');
  const rimIntVal = document.getElementById('rim-intensity-val');
  rimInt.addEventListener('input', (e) => {
    state.rimIntensity = parseFloat(e.target.value);
    state.rimLight.intensity = state.rimIntensity;
    rimIntVal.innerText = state.rimIntensity.toFixed(1);
  });

  // Rim Light Color Selection
  document.querySelectorAll('[data-rim-color]').forEach(dot => {
    dot.addEventListener('click', (e) => {
      document.querySelectorAll('[data-rim-color]').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.rimColor = dot.getAttribute('data-rim-color');
      state.rimLight.color.set(state.rimColor);
    });
  });
}

// -------------------------------------------------------------
// SKELETAL MANNEQUIN ASSEMBLY
// -------------------------------------------------------------

function buildMannequinHierarchy(config, parentObject) {
  // 1. Create the Local Pivot Group (Joint Node)
  const jointGroup = new THREE.Group();
  jointGroup.name = config.name;
  
  // Set position relative to its parent joint
  jointGroup.position.set(config.posX || 0, config.posY || 0, config.posZ || 0);
  
  // Add to parent group in scene
  parentObject.add(jointGroup);
  
  // Cache joint group in map for instant lookup
  state.joints[config.name] = jointGroup;
  
  // 2. Add Selectable Joint Marker Sphere (styled as a subtle, high-end metallic pivot pin)
  const sphereGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const jointSphere = new THREE.Mesh(sphereGeo, materials.jointDefault.clone());
  jointSphere.name = 'jointSphere_' + config.name;
  jointSphere.userData = { jointName: config.name };
  jointSphere.castShadow = false;
  jointSphere.receiveShadow = false;
  jointGroup.add(jointSphere);
  
  // Cache sphere mesh for raycast selection
  state.jointSpheres.push(jointSphere);

  // 3. Add Volumetric Body Segment Mesh (Tapered cylinders, rounded ellipsoids, jaw/skull)
  if (config.meshSize) {
    let geom, mesh;
    const size = config.meshSize;
    
    if (config.name === 'head') {
      // Artistic Anatomical Head Assembly: Separate cranial sphere and jaw box
      const headGroup = new THREE.Group();
      headGroup.name = 'headGroup';
      
      // Main Cranial Sphere (Skull)
      const skullGeo = new THREE.SphereGeometry(0.5, 32, 32);
      if (!state.originalGeometries) state.originalGeometries = {};
      state.originalGeometries['skull'] = skullGeo.clone();
      const skullMesh = new THREE.Mesh(skullGeo, materials.mannequinLimb);
      skullMesh.scale.set(size[0], size[1] * 0.6, size[2]);
      skullMesh.position.y = size[1] * 0.45; // Position cranial mass above head joint
      skullMesh.castShadow = true;
      skullMesh.receiveShadow = true;
      skullMesh.name = 'skullMesh';
      skullMesh.userData = { jointName: 'head' }; // Select head on click
      headGroup.add(skullMesh);
      state.limbs.push(skullMesh);

      // Shadow Overlay for Cranial Sphere (to receive shadows on Matcap material)
      const skullShadow = new THREE.Mesh(skullGeo, new THREE.ShadowMaterial({ opacity: 0.35 }));
      skullShadow.name = 'skullShadow';
      skullShadow.scale.copy(skullMesh.scale).multiplyScalar(1.0015);
      skullShadow.position.copy(skullMesh.position);
      skullShadow.receiveShadow = true;
      skullShadow.castShadow = false;
      skullShadow.userData = { jointName: 'head' };
      headGroup.add(skullShadow);
      state.shadowOverlays.push(skullShadow);

      // Stylized Planar Jaw & Chin Box (gives head dynamic orientation)
      const jawGeo = new THREE.BoxGeometry(size[0] * 0.85, size[1] * 0.45, size[2] * 0.85);
      state.originalGeometries['jaw'] = jawGeo.clone();
      const jawMesh = new THREE.Mesh(jawGeo, materials.mannequinLimb);
      jawMesh.position.set(0, size[1] * 0.1, size[2] * 0.15); // Place below and forward
      jawMesh.castShadow = true;
      jawMesh.receiveShadow = true;
      jawMesh.name = 'jawMesh';
      jawMesh.userData = { jointName: 'head' };  // Select head on click
      headGroup.add(jawMesh);
      state.limbs.push(jawMesh);

      // Shadow Overlay for Jaw
      const jawShadow = new THREE.Mesh(jawGeo, new THREE.ShadowMaterial({ opacity: 0.35 }));
      jawShadow.name = 'jawShadow';
      jawShadow.scale.copy(jawMesh.scale).multiplyScalar(1.0015);
      jawShadow.position.copy(jawMesh.position);
      jawShadow.receiveShadow = true;
      jawShadow.castShadow = false;
      jawShadow.userData = { jointName: 'head' };
      headGroup.add(jawShadow);
      state.shadowOverlays.push(jawShadow);
      
      // Loomis Facial Lines Overlay (helps study head rotation/perspective tilt)
      const eyeLineGeo = new THREE.RingGeometry(size[0] * 0.51, size[0] * 0.53, 64);
      eyeLineGeo.rotateX(Math.PI / 2); // Lay horizontal
      const eyeLine = new THREE.Line(eyeLineGeo, materials.loomisLine);
      eyeLine.position.y = size[1] * 0.45; // Position at skull center
      headGroup.add(eyeLine);
      state.limbs.push(eyeLine);
      
      const midlineGeo = new THREE.RingGeometry(size[0] * 0.51, size[0] * 0.53, 64);
      midlineGeo.rotateY(Math.PI / 2); // Lay vertical front-to-back
      const midline = new THREE.Line(midlineGeo, materials.loomisLine);
      midline.position.y = size[1] * 0.45;
      headGroup.add(midline);
      state.limbs.push(midline);

      headGroup.position.y = 0; // Skull base rests directly at the head joint pivot
      jointGroup.add(headGroup);
      
    } else {
      // Elegant organic geometries
      if (config.name === 'chest') {
        // Thoracic mass represents the ribbed cage egg
        geom = new THREE.SphereGeometry(0.5, 32, 32);
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
        mesh.scale.set(size[0], size[1], size[2]);
        mesh.position.y = size[1] / 2;
      } else if (config.name === 'pelvis') {
        // Pelvis bowl represents the rounded lower torso bowl
        geom = new THREE.SphereGeometry(0.5, 32, 32);
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
        mesh.scale.set(size[0], size[1], size[2]);
        mesh.position.y = size[1] / 2;
      } else if (config.name === 'leftFoot' || config.name === 'rightFoot') {
        // Feet are wedges extending forward
        geom = new THREE.BoxGeometry(size[0], size[1], size[2]);
        geom.translate(0, -size[1] / 2, size[2] / 4); // Shift forward
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
      } else if (config.name.includes('Hand')) {
        // Hands are represented as flat elegant wedges
        geom = new THREE.BoxGeometry(size[0] * 0.9, size[1], size[2]);
        geom.translate(0, -size[1] / 2, 0);
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
      } else if (config.name === 'neck' || config.name === 'spine') {
        // Neck and Spine columns extend UPWARD from their pivot points
        geom = new THREE.CylinderGeometry(size[0] * 0.45, size[0] * 0.55, size[1], 32);
        geom.translate(0, size[1] / 2, 0); // Shift so pivot is at the bottom of the cylinder
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
      } else {
        // Limbs are represented as beautifully tapered cylinders
        let rTop = size[0] * 0.5;
        let rBot = size[0] * 0.5;
        
        if (config.name.includes('UpperArm')) {
          rTop = size[0] * 0.5;
          rBot = size[0] * 0.38;
        } else if (config.name.includes('Forearm')) {
          rTop = size[0] * 0.38;
          rBot = size[0] * 0.26;
        } else if (config.name.includes('Thigh')) {
          rTop = size[0] * 0.54;
          rBot = size[0] * 0.4;
        } else if (config.name.includes('Calf')) {
          rTop = size[0] * 0.42;
          rBot = size[0] * 0.26;
        }
        
        geom = new THREE.CylinderGeometry(rTop, rBot, size[1], 32);
        geom.translate(0, -size[1] / 2, 0); // Center the pivot at the top of the limb
        mesh = new THREE.Mesh(geom, materials.mannequinLimb);
      }
      
      if (!state.originalGeometries) state.originalGeometries = {};
      state.originalGeometries[config.name] = geom.clone();
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'limbMesh_' + config.name;
      mesh.userData = { jointName: config.name }; // Select joint on clicking this bone
      
      // Position shifts
      if (config.name !== 'chest' && config.name !== 'pelvis' && !config.name.includes('Foot') && !config.name.includes('Hand') && config.name !== 'neck' && config.name !== 'spine') {
        mesh.position.set(0, 0, 0);
      }
      
      jointGroup.add(mesh);
      state.limbs.push(mesh);

      // Shadow Overlay for body segment (to receive shadows on Matcap material)
      const limbShadow = new THREE.Mesh(geom, new THREE.ShadowMaterial({ opacity: 0.35 }));
      limbShadow.name = 'limbShadow_' + config.name;
      limbShadow.scale.copy(mesh.scale).multiplyScalar(1.0015);
      limbShadow.position.copy(mesh.position);
      limbShadow.rotation.copy(mesh.rotation);
      limbShadow.receiveShadow = true;
      limbShadow.castShadow = false;
      limbShadow.userData = { jointName: config.name };
      jointGroup.add(limbShadow);
      state.shadowOverlays.push(limbShadow);
    }
  }

  // 4. Recurse and Build Children
  if (config.children && config.children.length > 0) {
    config.children.forEach(childConfig => {
      buildMannequinHierarchy(childConfig, jointGroup);
    });
  }
}

// Draw line skeleton helpers connecting joint nodes
function drawSkeletonLines() {
  if (state.skeletonLines) {
    state.scene.remove(state.skeletonLines);
  }
  
  state.skeletonLines = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2, depthTest: false });

  // Recursive path finder
  function traverse(joint) {
    const parentPos = new THREE.Vector3();
    joint.getWorldPosition(parentPos);

    joint.children.forEach(child => {
      if (child.isGroup && state.joints[child.name]) {
        const childPos = new THREE.Vector3();
        child.getWorldPosition(childPos);

        const geo = new THREE.BufferGeometry().setFromPoints([parentPos, childPos]);
        const line = new THREE.Line(geo, lineMat);
        line.renderOrder = 999; // Make skeletal lines render on top
        state.skeletonLines.add(line);
        
        traverse(child);
      }
    });
  }

  traverse(state.joints['pelvis']);
  
  state.skeletonLines.visible = state.skeletonVisible;
  state.scene.add(state.skeletonLines);
}

// -------------------------------------------------------------
// DYNAMIC 3D SELECTION VIA RAYCASTING
// -------------------------------------------------------------

function setup3DRaycasting() {
  const container = document.getElementById('canvas-container');
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Mouse hover detection
  container.addEventListener('mousemove', (e) => {
    const rect = state.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, state.camera);
    const intersects = raycaster.intersectObjects(state.jointSpheres);

    if (intersects.length > 0) {
      document.body.style.cursor = 'pointer';
      const intersectedSphere = intersects[0].object;

      if (state.hoveredJointSphere !== intersectedSphere) {
        // Reset old hover
        if (state.hoveredJointSphere && state.hoveredJointSphere.userData.jointName !== state.selectedJointName) {
          state.hoveredJointSphere.material = materials.jointDefault;
        }

        // Apply new hover
        state.hoveredJointSphere = intersectedSphere;
        if (state.hoveredJointSphere.userData.jointName !== state.selectedJointName) {
          state.hoveredJointSphere.material = materials.jointHover;
        }
      }
    } else {
      document.body.style.cursor = 'auto';
      if (state.hoveredJointSphere) {
        if (state.hoveredJointSphere.userData.jointName !== state.selectedJointName) {
          state.hoveredJointSphere.material = materials.jointDefault;
        }
        state.hoveredJointSphere = null;
      }
    }
  });

  // Mouse click selection
  container.addEventListener('pointerdown', (e) => {
    // Only capture simple clicks, not orbital drags
    let startX = e.clientX;
    let startY = e.clientY;

    const onPointerUp = (upEvt) => {
      const diffX = Math.abs(upEvt.clientX - startX);
      const diffY = Math.abs(upEvt.clientY - startY);
      
      // If pointer barely moved, count as single click selection
      if (diffX < 4 && diffY < 4) {
        raycaster.setFromCamera(mouse, state.camera);
        // Intersect both joint pin handles and actual anatomical limb volumes!
        const targets = [...state.jointSpheres, ...state.limbs];
        const intersects = raycaster.intersectObjects(targets);

        if (intersects.length > 0) {
          // Find the first intersected mesh that contains an anatomical jointName mapping
          let clickedJointName = null;
          for (let i = 0; i < intersects.length; i++) {
            const obj = intersects[i].object;
            if (obj.userData && obj.userData.jointName) {
              clickedJointName = obj.userData.jointName;
              break;
            }
          }
          if (clickedJointName) {
            selectJoint(clickedJointName);
          } else {
            deselectJoint();
          }
        } else {
          deselectJoint();
        }
      }
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointerup', onPointerUp);
  });

  // Mouse double-click to show transform controls gizmo
  container.addEventListener('dblclick', (e) => {
    const rect = state.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, state.camera);
    const targets = [...state.jointSpheres, ...state.limbs];
    const intersects = raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
      let clickedJointName = null;
      for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (obj.userData && obj.userData.jointName) {
          clickedJointName = obj.userData.jointName;
          break;
        }
      }
      if (clickedJointName) {
        selectJoint(clickedJointName, true); // Select and show gizmo
        return;
      }
    }
    
    // If double-clicking elsewhere but a joint is selected, show the gizmo
    if (state.selectedJointName && state.transformControls && state.manipulatorMode !== 'off') {
      state.transformControls.visible = true;
    }
  });
}

const bottomScalePanelConfig = {
  joint: { min: 50, max: 200, isTilt: false, sidebarId: null },
  torsoHeight: { min: 70, max: 140, isTilt: false, sidebarId: 'prop-torso-height' },
  torsoWidth: { min: 70, max: 150, isTilt: false, sidebarId: 'prop-torso-width' },
  chestWidth: { min: 60, max: 160, isTilt: false, sidebarId: 'prop-chest-width' },
  pelvisWidth: { min: 60, max: 160, isTilt: false, sidebarId: 'prop-pelvis-width' },
  pelvisTilt: { min: -30, max: 30, isTilt: true, sidebarId: 'prop-pelvis-tilt' },
  armLength: { min: 70, max: 140, isTilt: false, sidebarId: 'prop-arm-length' },
  legLength: { min: 70, max: 140, isTilt: false, sidebarId: 'prop-leg-length' },
  limbThickness: { min: 70, max: 150, isTilt: false, sidebarId: 'prop-limb-thickness' },
  headScale: { min: 70, max: 140, isTilt: false, sidebarId: 'prop-head-scale' }
};

function updateBottomScaleSliderConfig() {
  const selector = document.getElementById('scale-mode-selector');
  const slider = document.getElementById('joint-scale');
  const valText = document.getElementById('joint-scale-val');
  if (!selector || !slider) return;

  const mode = selector.value;
  const config = bottomScalePanelConfig[mode];
  if (!config) return;

  slider.min = config.min;
  slider.max = config.max;

  let value = 100;
  if (mode === 'joint') {
    const jointGroup = state.joints[state.selectedJointName];
    if (jointGroup) {
      value = Math.round(jointGroup.scale.x * 100);
    }
  } else {
    const rawVal = state.anatomy[mode];
    if (config.isTilt) {
      value = Math.round(rawVal);
    } else {
      value = Math.round(rawVal * 100);
    }
  }

  slider.value = value;
  if (valText) {
    valText.innerText = value + (config.isTilt ? '°' : '%');
  }
}

function clearSelectionOutlines() {
  if (state.selectionOutlines) {
    state.selectionOutlines.forEach(outline => {
      if (outline.parent) {
        outline.parent.remove(outline);
      }
      outline.geometry.dispose();
      if (outline.material) {
        outline.material.dispose();
      }
    });
  }
  state.selectionOutlines = [];
}

function createSelectionOutlines(jointName) {
  clearSelectionOutlines();
  if (!state.selectionOutlines) {
    state.selectionOutlines = [];
  }

  // Find all meshes in state.limbs that belong to this joint
  const jointLimbs = state.limbs.filter(limb => limb.userData && limb.userData.jointName === jointName);

  jointLimbs.forEach(limb => {
    if (limb.isMesh) {
      const geom = limb.geometry.clone();
      const outlineMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, // glowing warm amber gold
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.8
      });
      const outlineMesh = new THREE.Mesh(geom, outlineMat);

      // Copy local position and rotation
      outlineMesh.position.copy(limb.position);
      outlineMesh.rotation.copy(limb.rotation);

      // Scale up slightly to form the outline shell
      outlineMesh.scale.copy(limb.scale).multiplyScalar(1.08);

      outlineMesh.userData = { isOutline: true, targetLimb: limb };

      limb.parent.add(outlineMesh);
      state.selectionOutlines.push(outlineMesh);
    }
  });
}

function deselectJoint() {
  clearSelectionOutlines();

  // 1. Reset color of previously selected joint sphere
  const oldSphere = state.jointSpheres.find(s => s.userData.jointName === state.selectedJointName);
  if (oldSphere) {
    oldSphere.material = materials.jointDefault;
  }

  // 2. Clear selected state
  state.selectedJointName = '';

  // 3. Detach TransformControls gizmo
  if (state.transformControls) {
    state.transformControls.detach();
    state.transformControls.visible = false;
  }

  // 4. Sync UI selector
  const selector = document.getElementById('joint-selector');
  if (selector) selector.value = '';

  // 5. Hide top rotation panel
  const topPanel = document.getElementById('top-rotation-panel');
  if (topPanel) {
    topPanel.style.display = 'none';
  }

  // 6. Update bottom scale panel state (keep visible but disable active joint option)
  const optionJoint = document.querySelector('#scale-mode-selector option[value="joint"]');
  if (optionJoint) optionJoint.disabled = true;

  const scaleSelector = document.getElementById('scale-mode-selector');
  if (scaleSelector && scaleSelector.value === 'joint') {
    scaleSelector.value = 'torsoHeight'; // Default anatomy option
  }
  
  updateBottomScaleSliderConfig();
}

function selectJoint(jointName, showGizmo = false) {
  if (!state.joints[jointName]) return;

  // Clear previous outlines and create new ones
  clearSelectionOutlines();
  createSelectionOutlines(jointName);

  // 1. Reset color of previously selected joint sphere
  const oldSphere = state.jointSpheres.find(s => s.userData.jointName === state.selectedJointName);
  if (oldSphere) {
    oldSphere.material = materials.jointDefault;
  }

  // 2. Set new selection
  state.selectedJointName = jointName;
  const newSphere = state.jointSpheres.find(s => s.userData.jointName === jointName);
  if (newSphere) {
    newSphere.material = materials.jointSelected;
  }

  // 3. Sync UI selectors and sliders
  const selector = document.getElementById('joint-selector');
  selector.value = jointName;

  // Retrieve degrees rotations of selected Three.js joint
  const jointGroup = state.joints[jointName];
  const rotX = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.x));
  const rotY = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.y));
  const rotZ = Math.round(THREE.MathUtils.radToDeg(jointGroup.rotation.z));

  // Sync range inputs and texts
  updateSliderState('rotate-x', rotX);
  updateSliderState('rotate-y', rotY);
  updateSliderState('rotate-z', rotZ);

  // Enable active joint option in selector and default to it
  const optionJoint = document.querySelector('#scale-mode-selector option[value="joint"]');
  if (optionJoint) optionJoint.disabled = false;

  const scaleSelector = document.getElementById('scale-mode-selector');
  if (scaleSelector) {
    scaleSelector.value = 'joint';
  }

  updateBottomScaleSliderConfig();

  // Show and update top rotation panel
  const topPanel = document.getElementById('top-rotation-panel');
  if (topPanel) {
    topPanel.style.display = 'flex';
  }
  const topJointNameSpan = document.getElementById('top-joint-name');
  if (topJointNameSpan) {
    topJointNameSpan.innerText = jointName;
  }

  // Show bottom scale panel
  const scalePanel = document.getElementById('bottom-scale-panel');
  if (scalePanel) {
    scalePanel.style.display = 'flex';
  }

  // 4. Attach TransformControls gizmo to this joint if manipulator is active
  if (state.transformControls && state.manipulatorMode !== 'off') {
    state.transformControls.attach(jointGroup);
    state.transformControls.visible = showGizmo;
  }
}

function updateSliderState(id, val) {
  const slider = document.getElementById(id);
  const valText = document.getElementById(id + '-val');
  if (slider) slider.value = val;
  if (valText) valText.innerText = val + '°';

  // Also sync top slider if it is rotate-x, rotate-y, or rotate-z
  if (id.startsWith('rotate-')) {
    const topId = 'top-' + id;
    const topSlider = document.getElementById(topId);
    const topValText = document.getElementById(topId + '-val');
    if (topSlider) topSlider.value = val;
    if (topValText) topValText.innerText = val + '°';
  }
}

// -------------------------------------------------------------
// UI CONTROLS & EVENT LISTENERS
// -------------------------------------------------------------

function setupUIEventListeners() {
  // ---- 3D Manipulator Mode Buttons (Top Toolbar, Sidebar, and Viewport Floating synced) ----
  const manipBtns = document.querySelectorAll('.manip-btn');
  const sidebarManipBtns = document.querySelectorAll('.sidebar-manip-btn');
  
  function setManipMode(mode) {
    state.manipulatorMode = mode;
    
    // Update top toolbar buttons style
    manipBtns.forEach(b => {
      const isActive = b.id === 'btn-manip-' + mode;
      b.style.background = isActive ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.05)';
      b.style.color = isActive ? 'var(--rim-color)' : 'var(--text-secondary)';
    });

    // Update new top panel buttons style
    const topManipBtns = document.querySelectorAll('.top-manip-btn');
    topManipBtns.forEach(b => {
      const isActive = b.id === 'top-manip-' + mode;
      b.style.background = isActive ? 'rgba(6,182,212,0.25)' : 'none';
      b.style.color = isActive ? 'var(--rim-color)' : 'var(--text-secondary)';
    });

    // Update sidebar buttons style
    sidebarManipBtns.forEach(b => {
      const isActive = b.id === 'sidebar-manip-' + mode;
      b.style.background = isActive ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.05)';
      b.style.color = isActive ? 'var(--rim-color)' : 'var(--text-secondary)';
      b.style.borderColor = isActive ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)';
    });

    if (!state.transformControls) return;

    if (mode === 'off') {
      state.transformControls.detach();
      state.transformControls.visible = false;
    } else {
      state.transformControls.setMode(mode === 'translate' ? 'translate' : 'rotate'); // translate = move, rotate = rotate
      const jointGroup = state.joints[state.selectedJointName];
      if (jointGroup) {
        state.transformControls.attach(jointGroup);
        state.transformControls.visible = true;
      }
    }
  }

  // Hook up top toolbar click events
  const btnManipOff = document.getElementById('btn-manip-off');
  const btnManipRotate = document.getElementById('btn-manip-rotate');
  const btnManipTranslate = document.getElementById('btn-manip-translate');
  if (btnManipOff) btnManipOff.addEventListener('click', () => setManipMode('off'));
  if (btnManipRotate) btnManipRotate.addEventListener('click', () => setManipMode('rotate'));
  if (btnManipTranslate) btnManipTranslate.addEventListener('click', () => setManipMode('translate'));

  // Hook up top rotation panel manipulator mode select click events
  const topManipOff = document.getElementById('top-manip-off');
  const topManipRotate = document.getElementById('top-manip-rotate');
  const topManipTranslate = document.getElementById('top-manip-translate');
  if (topManipOff) topManipOff.addEventListener('click', () => setManipMode('off'));
  if (topManipRotate) topManipRotate.addEventListener('click', () => setManipMode('rotate'));
  if (topManipTranslate) topManipTranslate.addEventListener('click', () => setManipMode('translate'));

  // Hook up sidebar Joint Editor click events
  const sideManipOff = document.getElementById('sidebar-manip-off');
  const sideManipRotate = document.getElementById('sidebar-manip-rotate');
  const sideManipTranslate = document.getElementById('sidebar-manip-translate');
  if (sideManipOff) sideManipOff.addEventListener('click', () => setManipMode('off'));
  if (sideManipRotate) sideManipRotate.addEventListener('click', () => setManipMode('rotate'));
  if (sideManipTranslate) sideManipTranslate.addEventListener('click', () => setManipMode('translate'));

  // ---- Sidebar Collapse / Expand (Desktop & Mobile) ----
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
  const btnExpandSidebar = document.getElementById('btn-expand-sidebar');
  const appInterface = document.querySelector('.app-interface');
  const floatingLogoHeader = document.getElementById('floating-logo-header');

  if (btnCollapseSidebar && appInterface) {
    btnCollapseSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      appInterface.classList.add('sidebar-collapsed');
      if (floatingLogoHeader) floatingLogoHeader.style.display = 'flex';
    });
  }

  if (btnExpandSidebar && appInterface) {
    btnExpandSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      appInterface.classList.remove('sidebar-collapsed');
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar) sidebar.classList.add('open');
      if (floatingLogoHeader) floatingLogoHeader.style.display = 'none';
    });
  }

  // ---- Floating Clean Screen / Hide UI Mode ----
  const btnToggleUI = document.getElementById('btn-toggle-ui');
  const iconEyeOpen = document.getElementById('icon-eye-open');
  const iconEyeClosed = document.getElementById('icon-eye-closed');
  
  if (btnToggleUI && iconEyeOpen && iconEyeClosed) {
    btnToggleUI.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClean = document.body.classList.toggle('clean-screen-mode');
      
      if (isClean) {
        iconEyeOpen.style.display = 'none';
        iconEyeClosed.style.display = 'block';
        // Also close the sidebar automatically when entering clean mode
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) sidebar.classList.remove('open');
      } else {
        iconEyeOpen.style.display = 'block';
        iconEyeClosed.style.display = 'none';
      }
    });
  }

  // Selector Dropdown Changes
  document.getElementById('joint-selector').addEventListener('change', (e) => {
    if (e.target.value === '') {
      deselectJoint();
    } else {
      selectJoint(e.target.value);
    }
  });

  // Joint Rotations Changes
  const applyRotationFromUI = (axis, valDeg) => {
    const jointGroup = state.joints[state.selectedJointName];
    if (!jointGroup) return;

    const rad = THREE.MathUtils.degToRad(valDeg);
    jointGroup.rotation[axis] = rad;
    
    // Redraw wireframe skeleton lines to reflect new positions
    if (state.skeletonVisible) {
      drawSkeletonLines();
    }
  };

  document.getElementById('rotate-x').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('rotate-x-val').innerText = val + '°';
    applyRotationFromUI('x', val);
  });
  document.getElementById('rotate-x').addEventListener('change', () => {
    triggerAutoMatchPose();
  });

  document.getElementById('rotate-y').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('rotate-y-val').innerText = val + '°';
    applyRotationFromUI('y', val);
  });
  document.getElementById('rotate-y').addEventListener('change', () => {
    triggerAutoMatchPose();
  });

  document.getElementById('rotate-z').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('rotate-z-val').innerText = val + '°';
    applyRotationFromUI('z', val);
  });
  document.getElementById('rotate-z').addEventListener('change', () => {
    triggerAutoMatchPose();
  });

  // Viewport Top Floating Rotation Sliders Changes
  const topRotateX = document.getElementById('top-rotate-x');
  const topRotateY = document.getElementById('top-rotate-y');
  const topRotateZ = document.getElementById('top-rotate-z');

  if (topRotateX) {
    topRotateX.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('top-rotate-x-val').innerText = val + '°';
      const sidebarSlider = document.getElementById('rotate-x');
      if (sidebarSlider) sidebarSlider.value = val;
      const sidebarValText = document.getElementById('rotate-x-val');
      if (sidebarValText) sidebarValText.innerText = val + '°';
      applyRotationFromUI('x', val);
    });
    topRotateX.addEventListener('change', () => {
      triggerAutoMatchPose();
    });
  }

  if (topRotateY) {
    topRotateY.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('top-rotate-y-val').innerText = val + '°';
      const sidebarSlider = document.getElementById('rotate-y');
      if (sidebarSlider) sidebarSlider.value = val;
      const sidebarValText = document.getElementById('rotate-y-val');
      if (sidebarValText) sidebarValText.innerText = val + '°';
      applyRotationFromUI('y', val);
    });
    topRotateY.addEventListener('change', () => {
      triggerAutoMatchPose();
    });
  }

  if (topRotateZ) {
    topRotateZ.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('top-rotate-z-val').innerText = val + '°';
      const sidebarSlider = document.getElementById('rotate-z');
      if (sidebarSlider) sidebarSlider.value = val;
      const sidebarValText = document.getElementById('rotate-z-val');
      if (sidebarValText) sidebarValText.innerText = val + '°';
      applyRotationFromUI('z', val);
    });
    topRotateZ.addEventListener('change', () => {
      triggerAutoMatchPose();
    });
  }

  // scale-mode-selector Dropdown Change
  const scaleModeSelector = document.getElementById('scale-mode-selector');
  if (scaleModeSelector) {
    scaleModeSelector.addEventListener('change', () => {
      updateBottomScaleSliderConfig();
    });
  }

  // Parametric Scale Change
  const jointScaleSlider = document.getElementById('joint-scale');
  if (jointScaleSlider) {
    jointScaleSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const selector = document.getElementById('scale-mode-selector');
      if (!selector) return;
      const mode = selector.value;
      const config = bottomScalePanelConfig[mode];
      if (!config) return;

      const valText = document.getElementById('joint-scale-val');
      if (valText) {
        valText.innerText = val + (config.isTilt ? '°' : '%');
      }

      if (mode === 'joint') {
        const jointGroup = state.joints[state.selectedJointName];
        if (jointGroup) {
          const scaleScalar = val / 100;
          jointGroup.scale.setScalar(scaleScalar);
          if (state.skeletonVisible) drawSkeletonLines();
        }
      } else {
        // Anatomy proportions
        if (config.isTilt) {
          state.anatomy[mode] = val;
        } else {
          state.anatomy[mode] = val / 100;
        }

        // Sync to sidebar slider if it exists
        if (config.sidebarId) {
          const sidebarSlider = document.getElementById(config.sidebarId);
          if (sidebarSlider) sidebarSlider.value = val;
          const sidebarValText = document.getElementById(config.sidebarId + '-val');
          if (sidebarValText) sidebarValText.innerText = val + (config.isTilt ? '°' : '%');
        }

        updateMannequinProportions();
      }
    });
    jointScaleSlider.addEventListener('change', () => {
      triggerAutoMatchPose();
    });
  }

  // Joint Resets
  document.getElementById('btn-reset-joint').addEventListener('click', () => {
    const joint = state.joints[state.selectedJointName];
    if (joint) {
      joint.rotation.set(0, 0, 0);
      joint.scale.setScalar(1.0);
      updateSliderState('rotate-x', 0);
      updateSliderState('rotate-y', 0);
      updateSliderState('rotate-z', 0);

      updateBottomScaleSliderConfig();

      if (state.skeletonVisible) drawSkeletonLines();
      triggerAutoMatchPose();
    }
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    Object.values(state.joints).forEach(joint => {
      joint.rotation.set(0, 0, 0);
      joint.scale.setScalar(1.0);
    });
    // Set root Pelvis position height back to default
    state.joints['pelvis'].position.y = 4.9;
    state.joints['pelvis'].position.x = 0;
    state.joints['pelvis'].position.z = 0;

    selectJoint(state.selectedJointName);
    updateBottomScaleSliderConfig();
    if (state.skeletonVisible) drawSkeletonLines();
    triggerAutoMatchPose();
  });

  // Material Selector
  document.getElementById('material-selector').addEventListener('change', (e) => {
    const presetName = e.target.value;
    let selectedMaterial;
    const isMatcap = presetName.startsWith('matcap_');
    
    if (isMatcap) {
      // Swapping to a Matcap Shading Material
      const key = presetName.replace('matcap_', 'clay_');
      selectedMaterial = materials.matcaps[key];
    } else {
      // Swapping to a Standard PBR Material
      const config = materials.presets[presetName];
      if (config) {
        materials.mannequinLimb.color.set(config.color);
        materials.mannequinLimb.roughness = config.roughness;
        materials.mannequinLimb.metalness = config.metalness;
        materials.mannequinLimb.needsUpdate = true;
      }
      selectedMaterial = materials.mannequinLimb;
    }
    
    // Apply selected material to all visual mesh limbs
    state.limbs.forEach(limb => {
      if (limb.isMesh) {
        limb.material = selectedMaterial;
      }
    });
    
    // Synchronize shadow-overlay meshes: active ONLY for Matcaps!
    state.shadowOverlays.forEach(overlay => {
      overlay.visible = isMatcap && state.meshVisible;
    });

    // Apply selected material to custom model meshes if active
    if (state.customModel) {
      state.customModel.traverse((child) => {
        // Skip shadow overlay meshes which must always use ShadowMaterial
        if (child.isMesh && !(child.material instanceof THREE.ShadowMaterial)) {
          child.material = selectedMaterial;
        }
      });
      
      // Synchronize custom shadow overlays
      if (state.customShadowOverlays) {
        state.customShadowOverlays.forEach(overlay => {
          overlay.visible = isMatcap;
        });
      }
    }
  });

  // Display Toggles (Mesh, Skeleton, Grid)
  document.getElementById('toggle-mesh').addEventListener('change', (e) => {
    state.meshVisible = e.target.checked;
    state.limbs.forEach(limb => limb.visible = state.meshVisible);
    
    // Synchronize shadow-overlay visibility
    const isMatcap = document.getElementById('material-selector').value.startsWith('matcap_');
    state.shadowOverlays.forEach(overlay => {
      overlay.visible = isMatcap && state.meshVisible;
    });
  });

  document.getElementById('toggle-skeleton').addEventListener('change', (e) => {
    state.skeletonVisible = e.target.checked;
    if (state.skeletonVisible) {
      drawSkeletonLines();
    } else if (state.skeletonLines) {
      state.skeletonLines.visible = false;
    }
  });

  document.getElementById('toggle-grid').addEventListener('change', (e) => {
    state.gridVisible = e.target.checked;
    state.gridHelper.visible = state.gridVisible;
  });

  // Camera Focal Length
  const camFovSlider = document.getElementById('camera-fov');
  const camFovText = document.getElementById('camera-fov-val');
  camFovSlider.addEventListener('input', (e) => {
    const fov = parseInt(e.target.value);
    state.cameraFov = fov;
    state.camera.fov = fov;
    state.camera.updateProjectionMatrix();

    // Map focal length text visually (e.g. standard artistic millimeter equivalent)
    let mm = '50mm';
    if (fov > 85) mm = '18mm (Ultra Wide)';
    else if (fov > 70) mm = '24mm (Dynamic Wide)';
    else if (fov > 55) mm = '35mm (Wide Portrait)';
    else if (fov > 45) mm = '50mm (Standard)';
    else if (fov > 30) mm = '85mm (Telephoto Studio)';
    else mm = '135mm (Flat Compression)';

    camFovText.innerText = mm;
  });

  // Quick Camera Presets (Floating Toolbar)
  document.getElementById('cam-front').addEventListener('click', () => {
    resetActiveCameraBtn('cam-front');
    gsapCameraAnimation(0, 4.7, 12.0, 0, 4.2, 0);
  });
  document.getElementById('cam-three-quarters').addEventListener('click', () => {
    resetActiveCameraBtn('cam-three-quarters');
    gsapCameraAnimation(8.5, 6.2, 9.5, 0, 4.2, 0);
  });
  document.getElementById('cam-side').addEventListener('click', () => {
    resetActiveCameraBtn('cam-side');
    gsapCameraAnimation(-12, 4.7, 0, 0, 4.2, 0);
  });
  document.getElementById('cam-high').addEventListener('click', () => {
    resetActiveCameraBtn('cam-high');
    gsapCameraAnimation(4.5, 10.0, 7.5, 0, 3.5, 0);
  });
  document.getElementById('cam-top').addEventListener('click', () => {
    resetActiveCameraBtn('cam-top');
    gsapCameraAnimation(0.1, 15.0, 0.1, 0, 4.2, 0);
  });
  document.getElementById('cam-low').addEventListener('click', () => {
    resetActiveCameraBtn('cam-low');
    gsapCameraAnimation(6.0, 1.2, 9.0, 0, 4.5, 0);
  });

  // Pose Presets Buttons
  const presetIds = {
    'preset-neutral': 'neutral',
    'preset-running': 'running',
    'preset-heroic': 'heroic',
    'preset-sitting': 'sitting',
    'preset-jumping': 'jumping',
    'preset-torsotwist': 'torsotwist'
  };
  Object.entries(presetIds).forEach(([btnId, poseName]) => {
    document.getElementById(btnId).addEventListener('click', (e) => {
      document.querySelectorAll('.btn-grid button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      applyPresetPose(poseName);
      
      // Auto-update reference gallery if active in side-by-side mode!
      const appInterface = document.querySelector('.app-interface');
      if (appInterface && appInterface.classList.contains('has-reference-sidebar')) {
        const description = describeActivePose();
        const searchInput = document.getElementById('reference-search-input');
        if (searchInput) {
          searchInput.value = "Match Pose: " + description;
        }
        fetchWikimediaReferences(description);
      }
    });
  });

  // Capturing / Export / Import Poses
  document.getElementById('btn-capture').addEventListener('click', captureReferencePNG);
  document.getElementById('btn-search-reference').addEventListener('click', searchPoseReference);
  const btnFloatingSearch = document.getElementById('btn-floating-search');
  if (btnFloatingSearch) {
    btnFloatingSearch.addEventListener('click', searchPoseReference);
  }
  document.getElementById('btn-save-pose').addEventListener('click', exportPoseJSON);
  document.getElementById('btn-export-mesh').addEventListener('click', exportMannequinOBJ);
  document.getElementById('btn-export-gltf').addEventListener('click', exportMannequinGLTF);
  document.getElementById('pose-file-input').addEventListener('change', importPoseJSON);

  // Search Modal Event Listeners
  const searchModalBackdrop = document.getElementById('search-modal-backdrop');
  const searchInputField = document.getElementById('search-input-field');
  
  if (searchModalBackdrop && searchInputField) {
    document.getElementById('search-modal-close').addEventListener('click', () => {
      searchModalBackdrop.classList.remove('active');
    });
    
    searchModalBackdrop.addEventListener('click', (e) => {
      if (e.target === searchModalBackdrop) {
        searchModalBackdrop.classList.remove('active');
      }
    });

    // Handle Tag Pills selection
    document.querySelectorAll('.tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        pill.classList.toggle('active');
        
        const base = searchInputField.dataset.baseQuery || 'pose drawing reference';
        const activeTags = Array.from(document.querySelectorAll('.tag-pill.active'))
          .map(p => p.textContent.toLowerCase());
        
        if (activeTags.length > 0) {
          searchInputField.value = `${base} ${activeTags.join(' ')}`;
        } else {
          searchInputField.value = base;
        }
      });
    });

    // Handle Search buttons
    document.getElementById('btn-search-pinterest').addEventListener('click', () => {
      const query = searchInputField.value.trim();
      if (query) {
        window.open('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(query), '_blank');
      }
    });

    document.getElementById('btn-search-google').addEventListener('click', () => {
      const query = searchInputField.value.trim();
      if (query) {
        window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query), '_blank');
      }
    });

    // Handle In-App search trigger from modal
    document.getElementById('btn-search-in-app').addEventListener('click', () => {
      const query = searchInputField.value.trim();
      if (query) {
        // 1. Close search modal
        searchModalBackdrop.classList.remove('active');
        
        // 2. Open Reference Sidebar (Side-by-Side Split screen columns)
        const appInterface = document.querySelector('.app-interface');
        if (appInterface) {
          appInterface.classList.add('has-reference-sidebar');
        }
        
        // 3. Pre-fill sidebar search input
        const refSearchInput = document.getElementById('reference-search-input');
        if (refSearchInput) {
          refSearchInput.value = query;
        }
        
        // 4. Fetch references
        fetchWikimediaReferences(query);
      }
    });
  }

  // Reference Sidebar Panel Listeners
  const refSidebar = document.getElementById('reference-sidebar');
  const refSearchInput = document.getElementById('reference-search-input');
  
  if (refSidebar) {
    document.getElementById('btn-close-reference-sidebar').addEventListener('click', () => {
      const appInterface = document.querySelector('.app-interface');
      if (appInterface) {
        appInterface.classList.remove('has-reference-sidebar');
      }
    });
    
    document.getElementById('btn-reference-search-submit').addEventListener('click', () => {
      if (refSearchInput) {
        const query = refSearchInput.value.trim();
        if (query) fetchWikimediaReferences(query);
      }
    });

    refSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = refSearchInput.value.trim();
        if (query) fetchWikimediaReferences(query);
      }
    });

    // Match Pose button click listener
    const btnMatchPose = document.getElementById('btn-match-pose');
    if (btnMatchPose) {
      btnMatchPose.addEventListener('click', () => {
        // Describe active pose
        const description = describeActivePose();
        
        // Pre-fill search input
        if (refSearchInput) {
          refSearchInput.value = "Match Pose: " + description;
        }
        
        // Execute fetch reference
        fetchWikimediaReferences(description);
      });
    }

    // Include Artistic Nudes toggle listener
    const toggleArtisticNudes = document.getElementById('toggle-artistic-nudes');
    if (toggleArtisticNudes) {
      // Initialize state value
      state.includeArtisticNudes = toggleArtisticNudes.checked;
      
      toggleArtisticNudes.addEventListener('change', (e) => {
        state.includeArtisticNudes = e.target.checked;
        
        // Re-execute current search with new filter
        if (refSearchInput) {
          const query = refSearchInput.value.trim();
          if (query) {
            fetchWikimediaReferences(query);
          } else {
            fetchWikimediaReferences('standing');
          }
        }
      });
    }

    // Google Lens Canvas Pose visual search listener
    const btnLensCanvas = document.getElementById('btn-lens-canvas');
    if (btnLensCanvas) {
      btnLensCanvas.addEventListener('click', () => {
        reverseSearchPose();
      });
    }

    // Google Images Search button listener
    const btnGoogleSearch = document.getElementById('btn-google-search');
    if (btnGoogleSearch) {
      btnGoogleSearch.addEventListener('click', () => {
        executeGoogleSearch();
      });
    }

    // Reference URL Input Pinning listeners
    const btnUrlSubmit = document.getElementById('btn-reference-url-submit');
    const refUrlInput = document.getElementById('reference-url-input');
    if (btnUrlSubmit && refUrlInput) {
      btnUrlSubmit.addEventListener('click', () => {
        const url = refUrlInput.value.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
          pinReferenceImage(url);
          refUrlInput.value = ''; // Clear input
        } else {
          alert('Please paste a valid image URL (starting with http:// or https://)');
        }
      });
      
      refUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const url = refUrlInput.value.trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
            pinReferenceImage(url);
            refUrlInput.value = '';
          }
        }
      });
    }

    // Style Tabs click listeners
    const styleTabs = document.querySelectorAll('.ref-tab');
    styleTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        styleTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.selectedStyle = tab.dataset.style || 'all';
        
        // Re-execute current search with new style filter
        if (refSearchInput) {
          const query = refSearchInput.value.trim();
          if (query) {
            fetchWikimediaReferences(query);
          } else {
            // Default search if empty
            fetchWikimediaReferences('standing');
          }
        }
      });
    });
  }

  // Floating Pinned Card Close Listener
  const pinnedCard = document.getElementById('pinned-reference-card');
  if (pinnedCard) {
    document.getElementById('btn-close-pinned-card').addEventListener('click', () => {
      pinnedCard.style.display = 'none';
    });
    
    // Reverse Image Search Pinned Image
    const btnLensPinned = document.getElementById('btn-lens-pinned');
    if (btnLensPinned) {
      btnLensPinned.addEventListener('click', () => {
        const img = document.getElementById('pinned-reference-img');
        if (img && img.src) {
          const googleLensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(img.src)}`;
          window.open(googleLensUrl, '_blank');
        }
      });
    }
  }

  // Custom 3D Model Loading Event Handlers
  document.getElementById('model-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleCustom3DFile(file);
  });

  document.getElementById('btn-restore-mannequin').addEventListener('click', restoreDefaultMannequin);

  // Drag & Drop anywhere in the window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleCustom3DFile(file);
  });

  // Anatomy Proportions Event Listeners
  const torsoHeightSlider = document.getElementById('prop-torso-height');
  const torsoHeightVal = document.getElementById('prop-torso-height-val');
  torsoHeightSlider.addEventListener('input', (e) => {
    state.anatomy.torsoHeight = parseFloat(e.target.value) / 100;
    torsoHeightVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const torsoWidthSlider = document.getElementById('prop-torso-width');
  const torsoWidthVal = document.getElementById('prop-torso-width-val');
  torsoWidthSlider.addEventListener('input', (e) => {
    state.anatomy.torsoWidth = parseFloat(e.target.value) / 100;
    torsoWidthVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const chestWidthSlider = document.getElementById('prop-chest-width');
  const chestWidthVal = document.getElementById('prop-chest-width-val');
  chestWidthSlider.addEventListener('input', (e) => {
    state.anatomy.chestWidth = parseFloat(e.target.value) / 100;
    chestWidthVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const pelvisWidthSlider = document.getElementById('prop-pelvis-width');
  const pelvisWidthVal = document.getElementById('prop-pelvis-width-val');
  pelvisWidthSlider.addEventListener('input', (e) => {
    state.anatomy.pelvisWidth = parseFloat(e.target.value) / 100;
    pelvisWidthVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const pelvisTiltSlider = document.getElementById('prop-pelvis-tilt');
  const pelvisTiltVal = document.getElementById('prop-pelvis-tilt-val');
  pelvisTiltSlider.addEventListener('input', (e) => {
    state.anatomy.pelvisTilt = parseFloat(e.target.value);
    pelvisTiltVal.innerText = e.target.value + '°';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const armLengthSlider = document.getElementById('prop-arm-length');
  const armLengthVal = document.getElementById('prop-arm-length-val');
  armLengthSlider.addEventListener('input', (e) => {
    state.anatomy.armLength = parseFloat(e.target.value) / 100;
    armLengthVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const legLengthSlider = document.getElementById('prop-leg-length');
  const legLengthVal = document.getElementById('prop-leg-length-val');
  legLengthSlider.addEventListener('input', (e) => {
    state.anatomy.legLength = parseFloat(e.target.value) / 100;
    legLengthVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const limbThicknessSlider = document.getElementById('prop-limb-thickness');
  const limbThicknessVal = document.getElementById('prop-limb-thickness-val');
  limbThicknessSlider.addEventListener('input', (e) => {
    state.anatomy.limbThickness = parseFloat(e.target.value) / 100;
    limbThicknessVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  const headScaleSlider = document.getElementById('prop-head-scale');
  const headScaleVal = document.getElementById('prop-head-scale-val');
  headScaleSlider.addEventListener('input', (e) => {
    state.anatomy.headScale = parseFloat(e.target.value) / 100;
    headScaleVal.innerText = e.target.value + '%';
    updateMannequinProportions();
    updateBottomScaleSliderConfig();
  });

  document.getElementById('btn-reset-proportions').addEventListener('click', () => {
    state.anatomy.torsoHeight = 1.0;
    state.anatomy.torsoWidth = 1.0;
    state.anatomy.chestWidth = 1.0;
    state.anatomy.pelvisWidth = 1.0;
    state.anatomy.pelvisTilt = 0;
    state.anatomy.armLength = 1.0;
    state.anatomy.legLength = 1.0;
    state.anatomy.limbThickness = 1.0;
    state.anatomy.headScale = 1.0;

    torsoHeightSlider.value = 100;
    torsoHeightVal.innerText = '100%';
    torsoWidthSlider.value = 100;
    torsoWidthVal.innerText = '100%';
    chestWidthSlider.value = 100;
    chestWidthVal.innerText = '100%';
    pelvisWidthSlider.value = 100;
    pelvisWidthVal.innerText = '100%';
    pelvisTiltSlider.value = 0;
    pelvisTiltVal.innerText = '0°';
    armLengthSlider.value = 100;
    armLengthVal.innerText = '100%';
    legLengthSlider.value = 100;
    legLengthVal.innerText = '100%';
    limbThicknessSlider.value = 100;
    limbThicknessVal.innerText = '100%';
    headScaleSlider.value = 100;
    headScaleVal.innerText = '100%';

    updateMannequinProportions();
    updateBottomScaleSliderConfig();
    triggerAutoMatchPose();
  });

  // Trigger auto-match pose when any proportion slider is released
  const propSliders = [
    'prop-torso-height', 'prop-torso-width', 'prop-chest-width', 'prop-pelvis-width',
    'prop-pelvis-tilt', 'prop-arm-length', 'prop-leg-length', 'prop-limb-thickness',
    'prop-head-scale'
  ];
  propSliders.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        triggerAutoMatchPose();
      });
    }
  });

  // Initialize manipulator mode styles on startup
  setManipMode(state.manipulatorMode);
}

function resetActiveCameraBtn(id) {
  document.querySelectorAll('.camera-quick-presets button').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function resetCameraToThreeQuarters() {
  state.camera.position.set(8.5, 6.2, 9.5);
  state.orbitControls.target.set(0, 4.2, 0);
  state.orbitControls.update();
}

// Smooth camera motion animation
function gsapCameraAnimation(px, py, pz, tx, ty, tz) {
  // Standard simple linear interpolation for camera transitions if GSAP not loaded,
  // else run vanilla loops. Here we perform a smooth transition manually:
  const duration = 25; // steps
  let step = 0;
  
  const startP = state.camera.position.clone();
  const startT = state.orbitControls.target.clone();
  
  const targetP = new THREE.Vector3(px, py, pz);
  const targetT = new THREE.Vector3(tx, ty, tz);

  function transition() {
    if (step <= duration) {
      const t = step / duration;
      // Smooth step ease curve
      const ease = t * t * (3 - 2 * t);

      state.camera.position.lerpVectors(startP, targetP, ease);
      state.orbitControls.target.lerpVectors(startT, targetT, ease);
      state.orbitControls.update();
      
      step++;
      requestAnimationFrame(transition);
    }
  }
  transition();
}

// -------------------------------------------------------------
// POSE PRESET DATABASE LOGIC
// -------------------------------------------------------------

const poseDatabase = {
  neutral: {
    pelvisHeight: 4.9,
    rotations: {
      pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
      leftUpperArm: [5, 0, -10], leftForearm: [-15, 0, 0], leftHand: [0, 0, 0],
      rightUpperArm: [5, 0, 10], rightForearm: [-15, 0, 0], rightHand: [0, 0, 0],
      leftThigh: [0, 0, 5], leftCalf: [0, 0, 0], leftFoot: [0, 0, 0],
      rightThigh: [0, 0, -5], rightCalf: [0, 0, 0], rightFoot: [0, 0, 0]
    }
  },
  running: {
    pelvisHeight: 3.55,
    rotations: {
      pelvis: [18, -10, 0],
      spine: [-10, 8, 0],
      chest: [-8, 8, 5],
      neck: [-5, -6, 0],
      head: [5, 8, -4],
      leftUpperArm: [-45, 10, -15],
      leftForearm: [-75, 0, 0],
      leftHand: [10, 0, 0],
      rightUpperArm: [60, -20, 25],
      rightForearm: [-95, 0, 0], // Corrected to pure hinge
      rightHand: [-10, 0, 0],
      leftThigh: [36, 10, 5],   // Artist-tuned thigh flex
      leftCalf: [10, 0, 0],     // Artist-tuned calf extension
      leftFoot: [15, 0, 0],     // Adjusted for straight foot strike
      rightThigh: [-113, -15, -5], // Artist-tuned extreme thigh extension
      rightCalf: [101, 0, 0],   // Artist-tuned knee flexion relative to thigh
      rightFoot: [-25, 0, 0]
    }
  },
  heroic: {
    pelvisHeight: 4.65,
    rotations: {
      pelvis: [-5, 0, 0],
      spine: [10, 0, 0],
      chest: [8, 0, 0],
      neck: [-5, 0, 0],
      head: [-8, 0, 0],
      leftUpperArm: [35, 45, -55], // Adjusted shoulder rotation to place hand on hip
      leftForearm: [-90, 0, 0],    // Corrected to pure hinge
      leftHand: [10, 15, -10],
      rightUpperArm: [35, -45, 55], // Adjusted shoulder rotation
      rightForearm: [-90, 0, 0],   // Corrected to pure hinge
      rightHand: [10, -15, 10],
      leftThigh: [15, 10, -20],     // Inverted Z to abduct leg outward
      leftCalf: [-20, 0, 0],        // Knees slightly bent for strong athletic posture
      leftFoot: [5, -10, 0],
      rightThigh: [15, -10, 20],    // Inverted Z to abduct leg outward
      rightCalf: [-20, 0, 0],
      rightFoot: [5, 10, 0]
    }
  },
  sitting: {
    pelvisHeight: 2.7,
    rotations: {
      pelvis: [10, 0, 0],
      spine: [-5, 0, 0],
      chest: [-8, 0, 0],
      neck: [8, 0, 0],
      head: [5, 0, 0],
      leftUpperArm: [35, 25, -15],  // Adjusted shoulder inward swing
      leftForearm: [-60, 0, 0],    // Corrected to pure hinge
      leftHand: [10, 0, 0],
      rightUpperArm: [30, -25, 15], // Adjusted shoulder inward swing
      rightForearm: [-55, 0, 0],   // Corrected to pure hinge
      rightHand: [10, 0, 0],
      leftThigh: [-85, 15, 10],     // Inverted X to swing thighs FORWARD
      leftCalf: [90, 0, 0],         // Inverted X to bend knees BACKWARD relative to thighs
      leftFoot: [5, 0, 0],
      rightThigh: [-85, -15, -10],  // Inverted X to swing thighs FORWARD
      rightCalf: [90, 0, 0],        // Inverted X to bend knees BACKWARD relative to thighs
      rightFoot: [5, 0, 0]
    }
  },
  jumping: {
    pelvisHeight: 5.5,
    rotations: {
      pelvis: [15, 0, 0],
      spine: [-15, 0, 0],
      chest: [-15, 0, 0],
      neck: [-10, 0, 0],
      head: [-15, 0, 0],
      leftUpperArm: [-90, -20, -60], // Reaching forward-upward
      leftForearm: [-45, 0, 0],
      leftHand: [0, 0, 0],
      rightUpperArm: [45, -20, 60],  // Thrown backward-wide
      rightForearm: [-45, 0, 0],
      rightHand: [0, 0, 0],
      leftThigh: [-45, 10, -10],     // Swung FORWARD (-X)
      leftCalf: [90, 0, 0],          // Bent BACKWARD (+X)
      leftFoot: [-20, 0, 0],         // Pointed toe (-X)
      rightThigh: [30, -10, 10],     // Swung BACKWARD (+X)
      rightCalf: [60, 0, 0],         // Bent BACKWARD (+X)
      rightFoot: [-20, 0, 0]         // Pointed toe (-X)
    }
  },
  torsotwist: {
    pelvisHeight: 4.9,
    rotations: {
      pelvis: [0, 0, 0],          // Identical to standing pose
      spine: [0, -35, 0],
      chest: [-5, -20, -5],
      neck: [4, 30, 0],
      head: [2, 15, 0],
      leftUpperArm: [15, 10, -35],
      leftForearm: [-45, 0, 0],
      leftHand: [5, 0, 0],
      rightUpperArm: [30, -15, 55],
      rightForearm: [-75, 0, 0],  // Corrected to pure hinge
      rightHand: [-5, 0, 0],
      leftThigh: [0, 0, 5],       // Identical to standing pose
      leftCalf: [0, 0, 0],        // Identical to standing pose
      leftFoot: [0, 0, 0],        // Identical to standing pose
      rightThigh: [0, 0, -5],     // Identical to standing pose
      rightCalf: [0, 0, 0],       // Identical to standing pose
      rightFoot: [0, 0, 0]        // Identical to standing pose
    }
  }
};

function applyPresetPose(poseName) {
  const pose = poseDatabase[poseName];
  if (!pose) return;

  // Set Pelvis Base Height, calibrated to leg proportions scale
  const legScale = state.anatomy ? state.anatomy.legLength : 1.0;
  const groundingFactor = (0.3 + 4.6 * legScale) / 4.9;
  state.joints['pelvis'].position.y = pose.pelvisHeight * groundingFactor;
  
  // Set all individual joint rotations in radians
  Object.entries(pose.rotations).forEach(([jointName, rots]) => {
    const jointGroup = state.joints[jointName];
    if (jointGroup) {
      jointGroup.rotation.set(
        THREE.MathUtils.degToRad(rots[0]),
        THREE.MathUtils.degToRad(rots[1]),
        THREE.MathUtils.degToRad(rots[2])
      );
    }
  });

  // Redraw skeletal helper lines
  if (state.skeletonVisible) {
    drawSkeletonLines();
  }

  // Resync values in sliders for currently selected joint
  selectJoint(state.selectedJointName);
}

// -------------------------------------------------------------
// PROPORTIONAL ANATOMY SCALING ENGINE
// -------------------------------------------------------------

function updateMannequinProportions() {
  if (!state.mannequinGroup) return;

  const torsoH = state.anatomy.torsoHeight;
  const torsoW = state.anatomy.torsoWidth;
  const chestW = state.anatomy.chestWidth !== undefined ? state.anatomy.chestWidth : 1.0;
  const pelvisW = state.anatomy.pelvisWidth !== undefined ? state.anatomy.pelvisWidth : 1.0;
  const pelvisTilt = state.anatomy.pelvisTilt !== undefined ? state.anatomy.pelvisTilt : 0;
  const armL = state.anatomy.armLength;
  const legL = state.anatomy.legLength;
  const thickness = state.anatomy.limbThickness;
  const headS = state.anatomy.headScale;

  const pelvisTiltRad = THREE.MathUtils.degToRad(pelvisTilt);
  const cosT = Math.cos(pelvisTiltRad);
  const sinT = Math.sin(pelvisTiltRad);

  // Joint default local coordinates (relative to parent joint)
  const defaultJoints = {
    pelvis: { x: 0, y: 4.9, z: 0 },
    spine: { x: 0, y: 1.0, z: 0 },
    chest: { x: 0, y: 1.2, z: 0 },
    neck: { x: 0, y: 1.5, z: 0 },
    head: { x: 0, y: 0.5, z: 0 },
    leftUpperArm: { x: -1.2, y: 1.2, z: 0 },
    leftForearm: { x: 0, y: -1.8, z: 0 },
    leftHand: { x: 0, y: -1.6, z: 0 },
    rightUpperArm: { x: 1.2, y: 1.2, z: 0 },
    rightForearm: { x: 0, y: -1.8, z: 0 },
    rightHand: { x: 0, y: -1.6, z: 0 },
    leftThigh: { x: -0.8, y: 0.2, z: 0 },
    leftCalf: { x: 0, y: -2.4, z: 0 },
    leftFoot: { x: 0, y: -2.2, z: 0 },
    rightThigh: { x: 0.8, y: 0.2, z: 0 },
    rightCalf: { x: 0, y: -2.4, z: 0 },
    rightFoot: { x: 0, y: -2.2, z: 0 }
  };

  // Base mesh volumes (X, Y, Z dimensions)
  const defaultSizes = {
    pelvis: [1.8, 1.0, 1.3],
    spine: [0.8, 1.2, 0.8],
    chest: [2.0, 1.5, 1.2],
    neck: [0.4, 0.5, 0.4],
    head: [1.1, 1.4, 1.1],
    leftUpperArm: [0.55, 1.8, 0.55],
    leftForearm: [0.45, 1.6, 0.45],
    leftHand: [0.35, 0.5, 0.45],
    rightUpperArm: [0.55, 1.8, 0.55],
    rightForearm: [0.45, 1.6, 0.45],
    rightHand: [0.35, 0.5, 0.45],
    leftThigh: [0.9, 2.4, 0.9],
    leftCalf: [0.8, 2.2, 0.8],
    leftFoot: [0.7, 0.5, 1.4],
    rightThigh: [0.9, 2.4, 0.9],
    rightCalf: [0.8, 2.2, 0.8],
    rightFoot: [0.7, 0.5, 1.4]
  };

  // 1. Torso Height and Width
  // Move Spine Joint relative to Pelvis root, rotating position based on pelvis tilt
  const spineX = 0;
  const spineY = defaultJoints.spine.y * torsoH;
  state.joints['spine'].position.x = spineX * cosT - spineY * sinT;
  state.joints['spine'].position.y = spineX * sinT + spineY * cosT;

  // spine Mesh & Shadow
  const spineMesh = state.joints['spine'].getObjectByName('limbMesh_spine');
  const spineShadow = state.joints['spine'].getObjectByName('limbShadow_spine');
  if (spineMesh) {
    spineMesh.scale.set(
      defaultSizes.spine[0] * torsoW,
      defaultSizes.spine[1] * torsoH,
      defaultSizes.spine[2] * torsoW
    );
    if (spineShadow) spineShadow.scale.copy(spineMesh.scale).multiplyScalar(1.0015);
  }
  // Move Chest Joint relative to Spine
  state.joints['chest'].position.y = defaultJoints.chest.y * torsoH;

  // chest Mesh & Shadow
  const chestMesh = state.joints['chest'].getObjectByName('limbMesh_chest');
  const chestShadow = state.joints['chest'].getObjectByName('limbShadow_chest');
  if (chestMesh) {
    // Both width (X) and depth (Z) scale dynamically with chestW and torsoW, height (Y) scales with torsoH
    chestMesh.scale.set(
      defaultSizes.chest[0] * torsoW * chestW,
      defaultSizes.chest[1] * torsoH,
      defaultSizes.chest[2] * torsoW * chestW
    );
    chestMesh.position.y = (defaultSizes.chest[1] * torsoH) / 2;
    if (chestShadow) {
      chestShadow.scale.copy(chestMesh.scale).multiplyScalar(1.0015);
      chestShadow.position.y = chestMesh.position.y;
    }
  }

  // Move Shoulder Joints and Neck Joint relative to Chest
  state.joints['neck'].position.y = defaultJoints.neck.y * torsoH;
  state.joints['leftUpperArm'].position.y = defaultJoints.leftUpperArm.y * torsoH;
  state.joints['leftUpperArm'].position.x = defaultJoints.leftUpperArm.x * torsoW * chestW;
  state.joints['rightUpperArm'].position.y = defaultJoints.rightUpperArm.y * torsoH;
  state.joints['rightUpperArm'].position.x = defaultJoints.rightUpperArm.x * torsoW * chestW;

  // pelvis Mesh & Shadow
  const pelvisMesh = state.joints['pelvis'].getObjectByName('limbMesh_pelvis');
  const pelvisShadow = state.joints['pelvis'].getObjectByName('limbShadow_pelvis');
  if (pelvisMesh) {
    // Both width (X) and depth (Z) scale dynamically with pelvisW and torsoW, height (Y) scales with torsoH
    pelvisMesh.scale.set(
      defaultSizes.pelvis[0] * torsoW * pelvisW,
      defaultSizes.pelvis[1] * torsoH,
      defaultSizes.pelvis[2] * torsoW * pelvisW
    );
    pelvisMesh.position.y = (defaultSizes.pelvis[1] * torsoH) / 2;
    // Apply Pelvis side-to-side tilt rotation directly to the mesh
    pelvisMesh.rotation.z = pelvisTiltRad;
    if (pelvisShadow) {
      pelvisShadow.scale.copy(pelvisMesh.scale).multiplyScalar(1.0015);
      pelvisShadow.position.y = pelvisMesh.position.y;
      pelvisShadow.rotation.z = pelvisTiltRad;
    }
  }
  // Move Hip Joints relative to Pelvis, rotating coordinates by pelvis tilt to keep legs naturally grounded
  const leftThighX = defaultJoints.leftThigh.x * torsoW * pelvisW;
  const leftThighY = defaultJoints.leftThigh.y; // 0.2
  state.joints['leftThigh'].position.x = leftThighX * cosT - leftThighY * sinT;
  state.joints['leftThigh'].position.y = leftThighX * sinT + leftThighY * cosT;

  const rightThighX = defaultJoints.rightThigh.x * torsoW * pelvisW;
  const rightThighY = defaultJoints.rightThigh.y; // 0.2
  state.joints['rightThigh'].position.x = rightThighX * cosT - rightThighY * sinT;
  state.joints['rightThigh'].position.y = rightThighX * sinT + rightThighY * cosT;

  // neck Mesh & Shadow (slender column, not directly scaled by torso height)
  const neckMesh = state.joints['neck'].getObjectByName('limbMesh_neck');
  const neckShadow = state.joints['neck'].getObjectByName('limbShadow_neck');
  if (neckMesh) {
    neckMesh.scale.set(1.0, 1.0, 1.0);
    if (neckShadow) neckShadow.scale.copy(neckMesh.scale).multiplyScalar(1.0015);
  }

  // 2. Head Scale
  const headGroup = state.joints['head'].getObjectByName('headGroup');
  if (headGroup) {
    headGroup.scale.setScalar(headS);
  }

  // 3. Arms (Length & Thickness)
  const armJoints = ['leftUpperArm', 'rightUpperArm', 'leftForearm', 'rightForearm'];
  armJoints.forEach(j => {
    const mesh = state.joints[j].getObjectByName('limbMesh_' + j);
    const shadow = state.joints[j].getObjectByName('limbShadow_' + j);
    if (mesh) {
      mesh.scale.set(thickness, armL, thickness);
      if (shadow) shadow.scale.copy(mesh.scale).multiplyScalar(1.0015);
    }
  });
  // Move Elbow joints
  state.joints['leftForearm'].position.y = defaultJoints.leftForearm.y * armL;
  state.joints['rightForearm'].position.y = defaultJoints.rightForearm.y * armL;
  // Move Wrist joints
  state.joints['leftHand'].position.y = defaultJoints.leftHand.y * armL;
  state.joints['rightHand'].position.y = defaultJoints.rightHand.y * armL;

  // 4. Legs (Length & Thickness)
  const legJoints = ['leftThigh', 'rightThigh', 'leftCalf', 'rightCalf'];
  legJoints.forEach(j => {
    const mesh = state.joints[j].getObjectByName('limbMesh_' + j);
    const shadow = state.joints[j].getObjectByName('limbShadow_' + j);
    if (mesh) {
      mesh.scale.set(thickness, legL, thickness);
      if (shadow) shadow.scale.copy(mesh.scale).multiplyScalar(1.0015);
    }
  });
  // Move Knee Hinge joints
  state.joints['leftCalf'].position.y = defaultJoints.leftCalf.y * legL;
  state.joints['rightCalf'].position.y = defaultJoints.rightCalf.y * legL;
  // Move Ankle Hinge joints
  state.joints['leftFoot'].position.y = defaultJoints.leftFoot.y * legL;
  state.joints['rightFoot'].position.y = defaultJoints.rightFoot.y * legL;

  // 5. Grounding Math
  // Dynamic pelvis Y grounding for standing straight: Y = 0.3 + 4.6 * legL
  // For any pose, scale the default pelvisHeight by the groundingFactor
  const groundingFactor = (0.3 + 4.6 * legL) / 4.9;
  
  const activePoseBtn = document.querySelector('.btn-grid button.active');
  const activePoseName = activePoseBtn ? activePoseBtn.id.replace('preset-', '') : 'neutral';
  const basePelvisHeight = poseDatabase[activePoseName] ? poseDatabase[activePoseName].pelvisHeight : 4.9;
  
  state.joints['pelvis'].position.y = basePelvisHeight * groundingFactor;

  // 6. Sync selection outlines scale
  if (state.selectionOutlines) {
    state.selectionOutlines.forEach(outline => {
      if (outline.userData && outline.userData.targetLimb) {
        outline.scale.copy(outline.userData.targetLimb.scale).multiplyScalar(1.08);
      }
    });
  }

  // 7. Refresh skeleton wireframe
  if (state.skeletonVisible) {
    drawSkeletonLines();
  }
}

// -------------------------------------------------------------
// CAPTURE, EXPORT, AND IMPORT
// -------------------------------------------------------------

function captureReferencePNG() {
  // Capture logic:
  // To give artists a premium, high-quality reference, we can:
  // 1. Temporarily hide joint sphere overlay indicators so only mannequin body is photographed
  const oldSpheresVisible = state.jointSpheres.map(s => s.visible);
  state.jointSpheres.forEach(s => s.visible = false);
  
  // 2. Hide wireframe skeleton indicators unless specifically toggled on
  if (state.skeletonLines && !state.skeletonVisible) {
    state.skeletonLines.visible = false;
  }

  // 3. Force render target refresh
  state.renderer.render(state.scene, state.camera);
  
  // 4. Download file from drawing buffer
  try {
    const dataURL = state.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'pose_reference_' + Date.now() + '.png';
    link.href = dataURL;
    link.click();
  } catch (err) {
    console.error('Failed to capture canvas screenshot:', err);
  }

  // 5. Restore overlays to original state
  state.jointSpheres.forEach((s, idx) => s.visible = oldSpheresVisible[idx]);
  if (state.skeletonLines && state.skeletonVisible) {
    state.skeletonLines.visible = true;
  }
}

function searchPoseReference() {
  const backdrop = document.getElementById('search-modal-backdrop');
  if (backdrop && backdrop.classList.contains('active')) {
    backdrop.classList.remove('active');
    return;
  }

  const appInterface = document.querySelector('.app-interface');
  if (appInterface) {
    if (appInterface.classList.contains('has-reference-sidebar')) {
      appInterface.classList.remove('has-reference-sidebar');
      return;
    }
    
    // Toggle the sidebar open if results already exist in the gallery
    const grid = document.getElementById('reference-gallery-grid');
    const hasResults = grid && grid.querySelector('.reference-item') !== null;
    if (hasResults) {
      appInterface.classList.add('has-reference-sidebar');
      return;
    }
  }

  const activePoseBtn = document.querySelector('.btn-grid button.active');
  const activePoseName = activePoseBtn ? activePoseBtn.id.replace('preset-', '') : 'neutral';
  
  // Custom artist-friendly search terms mapping
  const poseSearchQueries = {
    neutral: '"standing model" OR "standing statue" OR "classical sculpture standing" OR "figure drawing standing" OR "life drawing standing"',
    running: '"running model" OR "running athlete" OR "running pose" OR "running dancer"',
    heroic: '"heroic statue" OR "classical sculpture man" OR "greek statue standing" OR "power stance"',
    sitting: '"sitting model" OR "sitting statue" OR "thinker statue" OR "figure drawing sitting" OR "life drawing sitting"',
    jumping: '"jumping dancer" OR "leaping athlete" OR "jumping dynamic" OR "jumping pose"',
    torsotwist: '"contrapposto statue" OR "torso twist" OR "classical sculpture contrapposto"'
  };
  
  const baseQuery = poseSearchQueries[activePoseName] || '"pose reference"';
  
  // Reset all tag pills
  document.querySelectorAll('.tag-pill').forEach(pill => pill.classList.remove('active'));
  
  // Set input field value
  const inputField = document.getElementById('search-input-field');
  if (inputField) {
    inputField.value = baseQuery;
    inputField.dataset.baseQuery = baseQuery;
  }
  
  // Open modal
  if (backdrop) {
    backdrop.classList.add('active');
  }
}

function exportPoseJSON() {
  const poseData = {
    pelvisHeight: state.joints['pelvis'].position.y,
    rotations: {}
  };

  Object.entries(state.joints).forEach(([name, group]) => {
    poseData.rotations[name] = [
      Math.round(THREE.MathUtils.radToDeg(group.rotation.x)),
      Math.round(THREE.MathUtils.radToDeg(group.rotation.y)),
      Math.round(THREE.MathUtils.radToDeg(group.rotation.z))
    ];
  });

  const jsonStr = JSON.stringify(poseData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'custom_pose_' + Date.now() + '.json';
  link.href = URL.createObjectURL(blob);
  link.click();
}

function exportMannequinOBJ() {
  if (!state.mannequinGroup) return;

  // 1. Force a world matrix update on the live mannequin to make sure all world coordinates are fresh
  state.mannequinGroup.updateMatrixWorld(true);

  // 2. Create a flat temporary group to hold world-space flattened meshes
  const flatExportGroup = new THREE.Group();
  flatExportGroup.name = 'posed_mannequin';

  // 3. Define the list of actual limb meshes we want to export (excluding shadow overlays, joint spheres, helper lines)
  const allowedNames = [
    'limbMesh_pelvis', 'limbMesh_spine', 'limbMesh_chest', 'limbMesh_neck',
    'skullMesh', 'jawMesh',
    'limbMesh_leftUpperArm', 'limbMesh_leftForearm', 'limbMesh_leftHand',
    'limbMesh_rightUpperArm', 'limbMesh_rightForearm', 'limbMesh_rightHand',
    'limbMesh_leftThigh', 'limbMesh_leftCalf', 'limbMesh_leftFoot',
    'limbMesh_rightThigh', 'limbMesh_rightCalf', 'limbMesh_rightFoot'
  ];

  // 4. Traverse the mannequin hierarchy and extract visual meshes
  state.mannequinGroup.traverse(child => {
    if (child.isMesh && allowedNames.includes(child.name)) {
      // Create a flat mesh in world space by cloning the geometry and baking the world matrix!
      const geomCopy = child.geometry.clone();
      
      // Bake all scales, rotations, and positions directly into vertex coordinates
      geomCopy.applyMatrix4(child.matrixWorld);
      
      // Create new mesh with the baked geometry
      const exportMesh = new THREE.Mesh(geomCopy, child.material.clone());
      exportMesh.name = child.name;
      
      flatExportGroup.add(exportMesh);
    }
  });

  // 5. Instantiate OBJExporter and parse the clean flat group
  const exporter = new THREE.OBJExporter();
  const result = exporter.parse(flatExportGroup);

  // 6. Download the generated clean OBJ string as a file
  const blob = new Blob([result], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'posed_mannequin.obj';
  link.href = URL.createObjectURL(blob);
  link.click();
}

function exportMannequinGLTF() {
  if (!state.mannequinGroup) return;

  // 1. Force a world matrix update to ensure all transformations are up to date
  state.mannequinGroup.updateMatrixWorld(true);

  // 2. Temporarily hide joint sphere pins and helper lines so they aren't part of the mesh
  const oldSpheresVisible = state.jointSpheres.map(s => s.visible);
  state.jointSpheres.forEach(s => s.visible = false);
  
  const oldSkeletonVisible = state.skeletonLines ? state.skeletonLines.visible : false;
  if (state.skeletonLines) state.skeletonLines.visible = false;
  
  // Hide Matcap shadow overlays so we only export the clean meshes
  const oldShadowsVisible = state.shadowOverlays.map(s => s.visible);
  state.shadowOverlays.forEach(s => s.visible = false);

  // 3. Instantiate GLTFExporter and parse the mannequin group
  const exporter = new THREE.GLTFExporter();
  exporter.parse(state.mannequinGroup, (gltf) => {
    // Restore joint and helper visibility
    state.jointSpheres.forEach((s, idx) => s.visible = oldSpheresVisible[idx]);
    if (state.skeletonLines) state.skeletonLines.visible = oldSkeletonVisible;
    state.shadowOverlays.forEach((s, idx) => s.visible = oldShadowsVisible[idx]);

    // Download the generated gltf JSON string as a file
    const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'posed_mannequin.gltf';
    link.href = URL.createObjectURL(blob);
    link.click();
  }, (err) => {
    alert('GLTF export error: ' + err.message);
    // Restore joint visibility in case of error
    state.jointSpheres.forEach((s, idx) => s.visible = oldSpheresVisible[idx]);
    if (state.skeletonLines) state.skeletonLines.visible = oldSkeletonVisible;
    state.shadowOverlays.forEach((s, idx) => s.visible = oldShadowsVisible[idx]);
  }, {
    binary: false,
    animations: [],
    includeCustomExtensions: false
  });
}



function importPoseJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const poseData = JSON.parse(evt.target.result);
      if (!poseData.rotations) throw new Error('Invalid Pose JSON format');

      // Remove active markings from hardcoded presets
      document.querySelectorAll('.btn-grid button').forEach(b => b.classList.remove('active'));

      // Apply imported data
      if (poseData.pelvisHeight !== undefined) {
        const legScale = state.anatomy ? state.anatomy.legLength : 1.0;
        const groundingFactor = (0.3 + 4.6 * legScale) / 4.9;
        state.joints['pelvis'].position.y = poseData.pelvisHeight * groundingFactor;
      }

      Object.entries(poseData.rotations).forEach(([jointName, rots]) => {
        const jointGroup = state.joints[jointName];
        if (jointGroup) {
          jointGroup.rotation.set(
            THREE.MathUtils.degToRad(rots[0]),
            THREE.MathUtils.degToRad(rots[1]),
            THREE.MathUtils.degToRad(rots[2])
          );
        }
      });

      if (state.skeletonVisible) drawSkeletonLines();
      selectJoint(state.selectedJointName);
      
      alert('Custom Pose imported successfully!');
    } catch (err) {
      alert('Failed to load pose file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------
// LIFECYCLE ANIMATION & RESIZE EVENTS
// -------------------------------------------------------------

let lastWidth = 0;
let lastHeight = 0;

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Performance Optimization: Only trigger WebGL repaint if container sizes actually morphed!
  if (width !== lastWidth || height !== lastHeight) {
    lastWidth = width;
    lastHeight = height;

    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();

    state.renderer.setSize(width, height);
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Smoothly morph WebGL viewport in real-time during side-by-side split screen animations!
  onWindowResize();

  // Update Orbit Controls camera adjustments
  if (state.orbitControls) {
    state.orbitControls.update();
  }

  // Render Scene
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
}

// -------------------------------------------------------------
// CUSTOM 3D ASSETS LOADING SYSTEM
// -------------------------------------------------------------

function showModelStatus(text, isError = false) {
  const statusDiv = document.getElementById('model-status');
  if (statusDiv) {
    statusDiv.innerText = text;
    statusDiv.style.color = isError ? '#f87171' : '#06b6d4';
  }
}

function getCurrentlySelectedMaterial() {
  const select = document.getElementById('material-selector');
  const val = select.value;
  if (val.startsWith('matcap_')) {
    const key = val.replace('matcap_', 'clay_');
    return materials.matcaps[key];
  } else {
    const config = materials.presets[val];
    if (config) {
      materials.mannequinLimb.color.set(config.color);
      materials.mannequinLimb.roughness = config.roughness;
      materials.mannequinLimb.metalness = config.metalness;
      materials.mannequinLimb.needsUpdate = true;
    }
    return materials.mannequinLimb;
  }
}

function handleCustom3DFile(file) {
  const name = file.name.toLowerCase();
  const extension = name.split('.').pop();
  
  if (!['obj', 'gltf', 'glb', 'stl'].includes(extension)) {
    showModelStatus('Unsupported format: .' + extension, true);
    return;
  }
  
  showModelStatus('Loading model ' + file.name + '...');
  
  const reader = new FileReader();
  
  if (extension === 'obj') {
    // OBJLoader expects a text string
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const loader = new THREE.OBJLoader();
        const obj = loader.parse(text);
        setupLoadedCustomModel(obj, file.name);
      } catch (err) {
        showModelStatus('Parse error: ' + err.message, true);
      }
    };
    reader.readAsText(file);
  } else {
    // GLTFLoader and STLLoader expect an ArrayBuffer
    reader.onload = function(e) {
      try {
        const buffer = e.target.result;
        
        if (extension === 'gltf' || extension === 'glb') {
          const loader = new THREE.GLTFLoader();
          loader.parse(buffer, '', (gltf) => {
            setupLoadedCustomModel(gltf.scene, file.name);
          }, (err) => {
            showModelStatus('GLTF parse error: ' + err.message, true);
          });
        } else if (extension === 'stl') {
          const loader = new THREE.STLLoader();
          const geometry = loader.parse(buffer);
          const activeMat = getCurrentlySelectedMaterial();
          const mesh = new THREE.Mesh(geometry, activeMat);
          setupLoadedCustomModel(mesh, file.name);
        }
      } catch (err) {
        showModelStatus('Buffer load error: ' + err.message, true);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function setupLoadedCustomModel(modelGroup, filename) {
  // Pre-scan: Check if this is a custom rigged skin replacement
  const customMeshes = {};
  let isSkinReplacement = false;
  
  modelGroup.traverse(child => {
    if (child.isMesh) {
      let name = child.name;
      // In OBJ format, loaders create parent Groups for each object tag, leaving the child Mesh name blank.
      // We check both the Mesh name and its parent Group name to ensure 100% robust matching.
      if (!name || (!name.startsWith('limbMesh_') && name !== 'skullMesh' && name !== 'jawMesh')) {
        if (child.parent && child.parent.name) {
          name = child.parent.name;
        }
      }

      if (name.startsWith('limbMesh_') || name === 'skullMesh' || name === 'jawMesh') {
        customMeshes[name] = child;
        isSkinReplacement = true;
      }
    }
  });

  if (isSkinReplacement) {
    // 1. Remove previous custom static model if it exists
    if (state.customModel) {
      state.scene.remove(state.customModel);
      state.customModel = null;
    }
    if (state.customShadowOverlays) {
      state.customShadowOverlays.forEach(overlay => {
        if (overlay.parent) overlay.parent.remove(overlay);
      });
    }
    state.customShadowOverlays = [];

    // Temporarily add loaded model to scene so its world matrices can be computed correctly!
    state.scene.add(modelGroup);

    // Force update of all world matrices in both hierarchies in their current active pose and proportions!
    state.mannequinGroup.updateMatrixWorld(true);
    modelGroup.updateMatrixWorld(true);

    // 2. Swapping loop: Swap geometries and shadow geometries using relative inverse transforms under the active pose/proportions
    const relativeMatrix = new THREE.Matrix4();
    
    Object.entries(customMeshes).forEach(([name, customMesh]) => {
      let defaultMesh = null;
      let defaultShadow = null;
      
      if (name.startsWith('limbMesh_')) {
        const jointName = name.replace('limbMesh_', '');
        const defaultJoint = state.joints[jointName];
        if (defaultJoint) {
          defaultMesh = defaultJoint.getObjectByName(name);
          defaultShadow = defaultJoint.getObjectByName('limbShadow_' + jointName);
        }
      } else if (name === 'skullMesh' || name === 'jawMesh') {
        const defaultHeadJoint = state.joints['head'];
        if (defaultHeadJoint) {
          defaultMesh = defaultHeadJoint.getObjectByName(name);
          defaultShadow = defaultHeadJoint.getObjectByName(name.replace('Mesh', 'Shadow'));
        }
      }
      
      if (defaultMesh) {
        // Ensure world matrices are fully up-to-date
        defaultMesh.updateMatrixWorld(true);
        customMesh.updateMatrixWorld(true);
        
        // Relative Matrix = defaultMesh.matrixWorld^-1 * customMesh.matrixWorld
        relativeMatrix.copy(defaultMesh.matrixWorld).invert().multiply(customMesh.matrixWorld);
        
        // Bake the relative transform directly into the cloned custom mesh geometry!
        const bakedGeometry = customMesh.geometry.clone().applyMatrix4(relativeMatrix);
        
        defaultMesh.geometry = bakedGeometry.clone();
        if (defaultShadow) {
          defaultShadow.geometry = defaultMesh.geometry;
        }
      }
    });

    // 3. Set state flag & refresh the mannequin proportions and layouts
    state.customSkinLoaded = true;
    updateMannequinProportions();

    // Remove the loaded model from the scene since its geometries have been baked and swapped!
    state.scene.remove(modelGroup);

    // 5. Make sure the default mannequin visual elements are fully visible and active!
    const meshCheck = document.getElementById('toggle-mesh').checked;
    state.meshVisible = meshCheck;
    state.limbs.forEach(limb => limb.visible = meshCheck);
    
    const isMatcap = document.getElementById('material-selector').value.startsWith('matcap_');
    state.shadowOverlays.forEach(overlay => {
      overlay.visible = isMatcap && meshCheck;
    });
    
    state.jointSpheres.forEach(sphere => sphere.visible = true);
    
    const skeletonCheck = document.getElementById('toggle-skeleton').checked;
    state.skeletonVisible = skeletonCheck;
    if (state.skeletonLines) {
      state.skeletonLines.visible = skeletonCheck;
    }
    
    state.mannequinVisible = true;

    // 4. Update UI
    showModelStatus('Loaded Custom Mannequin Skin! Rigging active.');
    document.getElementById('btn-restore-mannequin').style.display = 'block';

    // Remove locking overlay from Pose, Joint, and Proportions sections since rigging is active!
    document.querySelectorAll('.section').forEach(sec => {
      sec.classList.remove('disabled-reference');
    });

    // Sync scales to the newly imported geometries
    updateMannequinProportions();
    return;
  }

  // 1. Remove previous custom model and shadow overlays
  if (state.customModel) {
    state.scene.remove(state.customModel);
    state.customModel = null;
  }
  if (state.customShadowOverlays) {
    state.customShadowOverlays.forEach(overlay => {
      if (overlay.parent) overlay.parent.remove(overlay);
    });
  }
  state.customShadowOverlays = [];

  // 2. Hide standard mannequin visual elements
  state.limbs.forEach(limb => limb.visible = false);
  state.shadowOverlays.forEach(overlay => overlay.visible = false);
  state.jointSpheres.forEach(sphere => sphere.visible = false);
  if (state.skeletonLines) state.skeletonLines.visible = false;
  state.mannequinVisible = false;

  // 3. Configure the wrapper group to center and scale the model automatically
  state.customModel = new THREE.Group();
  state.scene.add(state.customModel);
  
  // Calculate original dimensions
  const box = new THREE.Box3().setFromObject(modelGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  // Scale factor (auto-normalize to a height of 8.0 units, fitting our studio perfectly)
  const maxDim = Math.max(size.x, size.y, size.z);
  const scaleFactor = 8.0 / (maxDim || 1.0);
  
  modelGroup.scale.setScalar(scaleFactor);
  // Position offset so the center is at (0, Y, 0) and the lowest point rests flat on Y = 0!
  modelGroup.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);
  
  state.customModel.add(modelGroup);
  
  // 4. Apply selected materials and enable shadows on all sub-meshes
  const activeMat = getCurrentlySelectedMaterial();
  const selectVal = document.getElementById('material-selector').value;
  const isMatcap = selectVal.startsWith('matcap_');
  
  modelGroup.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = activeMat;
      
      // If a Matcap material is active, spawn a transparent Shadow Overlay for self-shadowing!
      if (isMatcap) {
        const shadowOverlay = new THREE.Mesh(child.geometry.clone(), new THREE.ShadowMaterial({ opacity: 0.35 }));
        shadowOverlay.scale.copy(child.scale).multiplyScalar(1.0015);
        shadowOverlay.position.copy(child.position);
        shadowOverlay.rotation.copy(child.rotation);
        shadowOverlay.receiveShadow = true;
        shadowOverlay.castShadow = false;
        child.parent.add(shadowOverlay);
        state.customShadowOverlays.push(shadowOverlay);
      }
    }
  });
  
  // 5. Update UI & disable joint/pose sections for static reference model
  showModelStatus('Loaded ' + filename);
  document.getElementById('btn-restore-mannequin').style.display = 'block';
  
  document.querySelectorAll('.section').forEach(sec => {
    const title = sec.querySelector('.section-title');
    if (title && (title.id === 'sec-presets' || title.id === 'sec-joints' || title.id === 'sec-anatomy-title')) {
      sec.classList.add('disabled-reference');
    }
  });
  
  // Update camera focal targets
  state.orbitControls.target.set(0, 4.0, 0);
  state.orbitControls.update();
}

function restoreDefaultMannequin() {
  // Reset custom skin loaded flag
  state.customSkinLoaded = false;

  // 1. Remove custom model
  if (state.customModel) {
    state.scene.remove(state.customModel);
    state.customModel = null;
  }
  if (state.customShadowOverlays) {
    state.customShadowOverlays.forEach(overlay => {
      if (overlay.parent) overlay.parent.remove(overlay);
    });
  }
  state.customShadowOverlays = [];

  // Restore original procedural geometries if they were swapped
  if (state.originalGeometries) {
    Object.entries(state.originalGeometries).forEach(([name, origGeom]) => {
      if (name === 'skull' || name === 'jaw') {
        const mesh = state.joints['head'].getObjectByName(name + 'Mesh');
        const shadow = state.joints['head'].getObjectByName(name + 'Shadow');
        if (mesh) {
          mesh.geometry = origGeom.clone();
          if (shadow) shadow.geometry = mesh.geometry;
        }
      } else {
        const defaultJoint = state.joints[name];
        if (defaultJoint) {
          const mesh = defaultJoint.getObjectByName('limbMesh_' + name);
          const shadow = defaultJoint.getObjectByName('limbShadow_' + name);
          if (mesh) {
            mesh.geometry = origGeom.clone();
            if (shadow) shadow.geometry = mesh.geometry;
          }
        }
      }
    });
    
    // Sync current proportions to the restored meshes
    updateMannequinProportions();
  }

  // 2. Restore mannequin visibility based on checkboxes
  const meshCheck = document.getElementById('toggle-mesh').checked;
  state.meshVisible = meshCheck;
  state.limbs.forEach(limb => limb.visible = meshCheck);
  
  const isMatcap = document.getElementById('material-selector').value.startsWith('matcap_');
  state.shadowOverlays.forEach(overlay => {
    overlay.visible = isMatcap && meshCheck;
  });
  
  state.jointSpheres.forEach(sphere => sphere.visible = true);
  
  const skeletonCheck = document.getElementById('toggle-skeleton').checked;
  state.skeletonVisible = skeletonCheck;
  if (state.skeletonLines) {
    state.skeletonLines.visible = skeletonCheck;
  }
  
  state.mannequinVisible = true;

  // 3. Update UI & re-enable joint/pose sections
  showModelStatus('Or drag & drop anywhere!');
  document.getElementById('btn-restore-mannequin').style.display = 'none';
  
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.remove('disabled-reference');
  });
  
  // Focus camera back on default mannequin center
  state.orbitControls.target.set(0, 4.2, 0);
  state.orbitControls.update();
}



function describeActivePose() {
  if (!state.joints || !state.joints['pelvis']) return "standing";
  
  const pelvisY = state.joints['pelvis'].position.y;
  
  const leftThighDegX = THREE.MathUtils.radToDeg(state.joints['leftThigh'].rotation.x);
  const rightThighDegX = THREE.MathUtils.radToDeg(state.joints['rightThigh'].rotation.x);
  const leftThighDegZ = THREE.MathUtils.radToDeg(state.joints['leftThigh'].rotation.z);
  const rightThighDegZ = THREE.MathUtils.radToDeg(state.joints['rightThigh'].rotation.z);
  
  const leftCalfDegX = THREE.MathUtils.radToDeg(state.joints['leftCalf'].rotation.x);
  const rightCalfDegX = THREE.MathUtils.radToDeg(state.joints['rightCalf'].rotation.x);
  
  const leftArmDegX = THREE.MathUtils.radToDeg(state.joints['leftUpperArm'].rotation.x);
  const leftArmDegZ = THREE.MathUtils.radToDeg(state.joints['leftUpperArm'].rotation.z);
  const rightArmDegX = THREE.MathUtils.radToDeg(state.joints['rightUpperArm'].rotation.x);
  const rightArmDegZ = THREE.MathUtils.radToDeg(state.joints['rightUpperArm'].rotation.z);
  
  const chestDegX = THREE.MathUtils.radToDeg(state.joints['chest'].rotation.x);
  const chestDegY = THREE.MathUtils.radToDeg(state.joints['chest'].rotation.y);
  const spineDegX = THREE.MathUtils.radToDeg(state.joints['spine'].rotation.x);
  const spineDegY = THREE.MathUtils.radToDeg(state.joints['spine'].rotation.y);
  
  let basePose = 'standing';
  const thighSplit = Math.abs(leftThighDegX - rightThighDegX);
  
  // 1. Reclining/Lying: Low pelvis
  if (pelvisY < 2.2) {
    basePose = 'reclining';
  }
  // 2. Sitting: Low pelvis and at least one thigh swung forward heavily, with knee bent
  else if (pelvisY < 3.4 && (leftThighDegX < -40 || rightThighDegX < -40) && (leftCalfDegX > 30 || rightCalfDegX > 30)) {
    basePose = 'sitting';
  }
  // 3. Crouching: Low/Medium pelvis, both thighs swung forward
  else if (pelvisY < 3.6 && leftThighDegX < -30 && rightThighDegX < -30) {
    basePose = 'crouching';
  }
  // 4. Kneeling: Low pelvis, knees bent heavily but thighs not swung forward as much
  else if (pelvisY < 3.4 && (leftCalfDegX > 60 || rightCalfDegX > 60)) {
    basePose = 'kneeling';
  }
  // 5. Jumping: High pelvis and knees bent or split stance
  else if (pelvisY > 5.1 && (leftCalfDegX > 40 || rightCalfDegX > 40 || thighSplit > 50)) {
    basePose = 'jumping';
  }
  // 6. Running/Stepping: Big thigh split
  else if (thighSplit > 45) {
    basePose = 'running';
  }
  // 7. Default Standing
  else {
    basePose = 'standing';
  }
  
  const descriptions = [];
  descriptions.push(basePose);
  
  // Torso bending - NOTE: positive rotation is leaning forward, negative is leaning back
  const totalBendX = chestDegX + spineDegX;
  if (totalBendX > 15) {
    descriptions.push('leaning forward');
  } else if (totalBendX < -15) {
    descriptions.push('leaning back');
  }
  
  // Torso twist
  const totalTwistY = chestDegY + spineDegY;
  if (Math.abs(totalTwistY) > 15) {
    descriptions.push('torso twisted');
  }
  
  // Arms: raise checks (only classify as up if Z is highly elevated or X is heavily flexed forward)
  // Sideways abduction Z > 70/<-70, forward raising X < -60
  const leftArmUp = (leftArmDegZ < -70 || leftArmDegX < -65);
  const rightArmUp = (rightArmDegZ > 70 || rightArmDegX < -65);
  
  if (leftArmUp && rightArmUp) {
    descriptions.push('both arms raised');
  } else if (leftArmUp) {
    descriptions.push('left arm raised');
  } else if (rightArmUp) {
    descriptions.push('right arm raised');
  }
  
  return descriptions.join(' ');
}


function fetchWikimediaReferences(rawQuery) {
  const grid = document.getElementById('reference-gallery-grid');
  if (!grid) return;
  
  // Show loading spinner
  grid.innerHTML = `
    <div class="reference-loading">
      <div class="reference-spinner"></div>
      <span>Searching art references...</span>
    </div>
  `;
  
  // Clean up "Match Pose:" prefix if present
  let cleanQuery = rawQuery;
  if (cleanQuery.toLowerCase().startsWith('match pose:')) {
    cleanQuery = cleanQuery.substring(11).trim();
  }
  
  // Build a high-quality curated search query for Wikimedia Commons
  const searchQuery = compileHighQualityQuery(cleanQuery, state.selectedStyle, false);
  console.log("Reference search query (specific):", searchQuery);
  
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=400&gsrlimit=30&format=json&origin=*`;
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      grid.innerHTML = '';
      const existingUrls = new Set();
      let count = 0;
      
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        pages.sort((a, b) => (b.pageid || 0) - (a.pageid || 0));
        
        pages.forEach(page => {
          if (count >= 10) return;
          if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
            const info = page.imageinfo[0];
            const imgUrl = info.url;
            const mime = (info.mime || '').toLowerCase();
            
            if (!mime.startsWith('image/') || mime.includes('svg') || mime.includes('tiff') || mime.includes('pdf')) return;
            if (info.width && info.height && (info.width < 150 || info.height < 150)) return;
            
            const thumbUrl = info.thumburl || imgUrl;
            if (existingUrls.has(thumbUrl)) return;
            existingUrls.add(thumbUrl);
            
            count++;
            
            const item = document.createElement('div');
            item.className = 'reference-item';
            item.title = (page.title || '').replace('File:', '');
            item.innerHTML = `<img src="${thumbUrl}" alt="${item.title.replace(/"/g, '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">`;
            
            item.addEventListener('click', () => {
              pinReferenceImage(imgUrl);
            });
            
            grid.appendChild(item);
          }
        });
      }
      
      // If we got fewer than 8 results, let's load broader results to fill slots!
      const poseTerms = /\b(standing|sitting|seated|sit|running|run|jumping|jump|kneeling|kneel|crouching|crouch|lying|recline|reclining|contrapposto|twist|bending|bend|leaning|lean|forward|backward|walking|walk|dancing|dance|heroic|action|dynamic|arms?\s*raised|reaching)\b/i;
      const isMatchPose = cleanQuery.includes('pose') || cleanQuery.includes('match') || poseTerms.test(cleanQuery);
      
      if (count < 8 && isMatchPose) {
        fetchWikimediaBroadFallback(cleanQuery, grid, count, existingUrls);
      } else if (count === 0) {
        fetchOpenverseFallback(cleanQuery, grid, count, existingUrls);
      }
    })
    .catch(err => {
      console.error('Wikimedia Commons fetch failed, trying Openverse fallback:', err);
      fetchOpenverseFallback(cleanQuery, grid, 0, new Set());
    });
}

function fetchWikimediaBroadFallback(cleanQuery, grid, currentCount, existingUrls) {
  const searchQuery = compileHighQualityQuery(cleanQuery, state.selectedStyle, true); // forceBroad = true
  console.log("Reference search query (broad fallback):", searchQuery);
  
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=400&gsrlimit=20&format=json&origin=*`;
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      let count = currentCount;
      
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        pages.sort((a, b) => (b.pageid || 0) - (a.pageid || 0));
        
        pages.forEach(page => {
          if (count >= 10) return;
          if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
            const info = page.imageinfo[0];
            const imgUrl = info.url;
            const thumbUrl = info.thumburl || imgUrl;
            
            if (existingUrls.has(thumbUrl)) return;
            existingUrls.add(thumbUrl);
            
            const mime = (info.mime || '').toLowerCase();
            if (!mime.startsWith('image/') || mime.includes('svg') || mime.includes('tiff') || mime.includes('pdf')) return;
            if (info.width && info.height && (info.width < 150 || info.height < 150)) return;
            
            count++;
            
            const item = document.createElement('div');
            item.className = 'reference-item';
            item.title = (page.title || '').replace('File:', '');
            item.innerHTML = `<img src="${thumbUrl}" alt="${item.title.replace(/"/g, '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">`;
            
            item.addEventListener('click', () => {
              pinReferenceImage(imgUrl);
            });
            
            grid.appendChild(item);
          }
        });
      }
      
      if (count < 8) {
        fetchOpenverseFallback(cleanQuery, grid, count, existingUrls);
      }
    })
    .catch(() => {
      if (count < 8) {
        fetchOpenverseFallback(cleanQuery, grid, count, existingUrls);
      }
    });
}

function compileHighQualityQuery(poseDescription, style, forceBroad = false) {
  const desc = (poseDescription || '').toLowerCase().trim();
  
  // Detect if this is a pose-related search
  const poseTerms = /\b(standing|sitting|seated|sit|running|run|jumping|jump|kneeling|kneel|crouching|crouch|lying|recline|reclining|contrapposto|twist|bending|bend|leaning|lean|forward|backward|walking|walk|dancing|dance|heroic|action|dynamic|arms?\s*raised|reaching)\b/i;
  const isMatchPose = desc.includes('pose') || desc.includes('match') || poseTerms.test(desc);
  
  // Extract the core pose word
  let poseWord = 'standing';
  if (desc.includes('sitting') || desc.includes('seated') || desc.includes('sit')) poseWord = 'sitting';
  else if (desc.includes('running') || desc.includes('sprint') || desc.includes('run')) poseWord = 'running';
  else if (desc.includes('jumping') || desc.includes('leap') || desc.includes('jump')) poseWord = 'jumping';
  else if (desc.includes('kneeling') || desc.includes('kneel')) poseWord = 'kneeling';
  else if (desc.includes('crouch') || desc.includes('crouching') || desc.includes('squat')) poseWord = 'crouching';
  else if (desc.includes('lying') || desc.includes('reclining') || desc.includes('recline')) poseWord = 'reclining';
  else if (desc.includes('walking') || desc.includes('walk')) poseWord = 'walking';
  else if (desc.includes('dancing') || desc.includes('dance')) poseWord = 'dancing';
  else if (desc.includes('bending') || desc.includes('bend')) poseWord = 'bending';
  else if (desc.includes('twist') || desc.includes('contrapposto')) poseWord = 'contrapposto';
  else if (desc.includes('heroic')) poseWord = 'heroic';

  // Extract extra descriptive modifier keywords from the description (limit to 1 to keep queries focused)
  let modifierString = '';
  if (!forceBroad) {
    const modifiers = [];
    if (desc.includes('arms raised') || desc.includes('arm raised')) {
      modifiers.push('arms raised');
    }
    if (desc.includes('leaning forward')) {
      modifiers.push('leaning forward');
    } else if (desc.includes('leaning back')) {
      modifiers.push('leaning back');
    }
    if (desc.includes('twist') || desc.includes('contrapposto') || desc.includes('twisted')) {
      modifiers.push('twist');
    }
    modifierString = modifiers.slice(0, 1).join(' ');
  }
  
  const querySuffix = modifierString ? ' ' + modifierString : '';
  
  // Build curated, tested search queries for each style
  if (isMatchPose) {
    if (state.includeArtisticNudes) {
      if (style === 'sculpture') {
        if (poseWord === 'running') return `statue running filetype:bitmap -monument`;
        if (poseWord === 'jumping') return `statue dynamic leap filetype:bitmap -monument`;
        return `greek marble statue ${poseWord}${querySuffix} filetype:bitmap -monument`;
      } else if (style === 'drawing') {
        return `academic nude drawing ${poseWord}${querySuffix} filetype:bitmap`;
      } else if (style === 'photo') {
        if (poseWord === 'running' || poseWord === 'jumping' || poseWord === 'walking') {
          return `Muybridge ${poseWord} filetype:bitmap`;
        }
        return `nude model ${poseWord}${querySuffix} filetype:bitmap`;
      } else {
        // "All Styles"
        if (poseWord === 'running' || poseWord === 'jumping' || poseWord === 'walking') {
          return `Muybridge ${poseWord} OR academic nude ${poseWord} filetype:bitmap`;
        }
        return `nude academic ${poseWord}${querySuffix} filetype:bitmap`;
      }
    } else {
      // SFW / No nudes mode
      if (style === 'sculpture') {
        if (poseWord === 'running') return `statue running filetype:bitmap -monument`;
        if (poseWord === 'jumping') return `statue dynamic leap filetype:bitmap -monument`;
        return `greek marble statue ${poseWord}${querySuffix} filetype:bitmap -monument`;
      } else if (style === 'drawing') {
        return `anatomy figure ${poseWord}${querySuffix} filetype:bitmap`;
      } else if (style === 'photo') {
        if (poseWord === 'running' || poseWord === 'jumping' || poseWord === 'walking') {
          return `athlete photo ${poseWord} filetype:bitmap`;
        }
        return `classical statue ${poseWord}${querySuffix} museum filetype:bitmap -monument`;
      } else {
        // "All Styles"
        if (poseWord === 'running' || poseWord === 'jumping' || poseWord === 'walking') {
          return `statue ${poseWord} OR anatomy drawing ${poseWord} filetype:bitmap -monument`;
        }
        return `classical statue ${poseWord}${querySuffix} filetype:bitmap -monument`;
      }
    }
  }
  
  // For non-pose searches, pass through with art-quality suffix
  if (state.includeArtisticNudes) {
    if (style === 'sculpture') {
      return `${desc} sculpture statue filetype:bitmap`;
    } else if (style === 'drawing') {
      return `${desc} nude academic drawing sketch filetype:bitmap`;
    } else if (style === 'photo') {
      return `${desc} nude model photography filetype:bitmap`;
    }
    return `${desc} nude academic filetype:bitmap`;
  } else {
    if (style === 'sculpture') {
      return `${desc} sculpture statue filetype:bitmap`;
    } else if (style === 'drawing') {
      return `${desc} anatomy drawing sketch filetype:bitmap`;
    } else if (style === 'photo') {
      return `${desc} statue classical photo filetype:bitmap`;
    }
    return `${desc} filetype:bitmap`;
  }
}

function fetchOpenverseFallback(cleanQuery, grid, currentCount, existingUrls) {
  const simple = deriveSimplePoseTerm(cleanQuery);
  const searchQuery = `${simple} figure anatomy drawing sculpture`;
  console.log("Openverse fallback search query:", searchQuery);
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(searchQuery)}&license_type=commercial,modification&page_size=20&mature=false`;
  
  fetch(url, {
    headers: { 'Accept': 'application/json' }
  })
    .then(res => {
      if (!res.ok) throw new Error('Openverse returned ' + res.status);
      return res.json();
    })
    .then(data => {
      if (currentCount === 0) grid.innerHTML = '';
      const results = data.results || [];
      let count = currentCount;
      
      results.forEach(img => {
        if (count >= 10) return;
        if (img.url) {
          const imgUrl = img.thumbnail || img.url;
          const fullUrl = img.url;
          
          if (existingUrls.has(imgUrl)) return;
          existingUrls.add(imgUrl);
          
          count++;
          
          const item = document.createElement('div');
          item.className = 'reference-item';
          item.title = img.title || '';
          item.innerHTML = `<img src="${imgUrl}" alt="${(img.title || '').replace(/"/g, '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">`;
          
          item.addEventListener('click', () => {
            pinReferenceImage(fullUrl);
          });
          
          grid.appendChild(item);
        }
      });
      
      if (count === 0) {
        grid.innerHTML = `<div class="reference-placeholder">No references found. Try: "standing", "running", "sitting" or click "Search on Google Images" above!</div>`;
      }
    })
    .catch(err => {
      console.error('Openverse fallback also failed:', err);
      if (currentCount === 0) {
        grid.innerHTML = `<div class="reference-placeholder">Search temporarily unavailable. Use "Search on Google Images" button above to browse references!</div>`;
      }
    });
}

function deriveSimplePoseTerm(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('sitting') || d.includes('seated')) return 'seated';
  if (d.includes('running') || d.includes('sprint')) return 'running';
  if (d.includes('jumping')) return 'jumping';
  if (d.includes('kneeling')) return 'kneeling';
  if (d.includes('crouch') || d.includes('squat')) return 'crouching';
  if (d.includes('lying') || d.includes('reclining')) return 'reclining';
  if (d.includes('bending') || d.includes('lean forward')) return 'bending forward';
  if (d.includes('twist') || d.includes('contrapposto')) return 'contrapposto';
  return 'standing';
}

function analyzeMannequinPose() {
  const tags = [];
  
  if (!state.joints || !state.joints['pelvis']) return { base: 'standing', tags: ['standing'] };

  // 1. Pelvis height
  const pelvisY = state.joints['pelvis'].position.y;
  
  // 2. Thigh rotations (converted to degrees)
  const leftThighDegX = THREE.MathUtils.radToDeg(state.joints['leftThigh'].rotation.x);
  const rightThighDegX = THREE.MathUtils.radToDeg(state.joints['rightThigh'].rotation.x);
  
  // 3. Calf rotations (knees, converted to degrees)
  const leftCalfDegX = THREE.MathUtils.radToDeg(state.joints['leftCalf'].rotation.x);
  const rightCalfDegX = THREE.MathUtils.radToDeg(state.joints['rightCalf'].rotation.x);
  
  // 4. Spine / Chest rotations
  const spineDegY = THREE.MathUtils.radToDeg(state.joints['spine'].rotation.y);
  const chestDegY = THREE.MathUtils.radToDeg(state.joints['chest'].rotation.y);
  const chestDegZ = THREE.MathUtils.radToDeg(state.joints['chest'].rotation.z);
  
  // 5. Shoulder/UpperArm rotations
  const leftArmDegX = THREE.MathUtils.radToDeg(state.joints['leftUpperArm'].rotation.x);
  const leftArmDegZ = THREE.MathUtils.radToDeg(state.joints['leftUpperArm'].rotation.z);
  const rightArmDegX = THREE.MathUtils.radToDeg(state.joints['rightUpperArm'].rotation.x);
  const rightArmDegZ = THREE.MathUtils.radToDeg(state.joints['rightUpperArm'].rotation.z);

  // Determine verticality base state
  let poseBase = 'standing';
  
  // If pelvis is very low, it's sitting, kneeling, or lying
  if (pelvisY < 1.8) {
    poseBase = 'lying';
    tags.push('reclining');
  } else if (pelvisY < 3.4) {
    // If thighs are swung forward (X rotation < -45), it's sitting
    if (leftThighDegX < -45 || rightThighDegX < -45) {
      poseBase = 'sitting';
      tags.push('sitting');
    } else {
      poseBase = 'kneeling';
      tags.push('kneeling');
    }
  } else {
    // Check if thighs are bent forward even if pelvis height hasn't been lowered much
    if (leftThighDegX < -45 && rightThighDegX < -45) {
      poseBase = 'sitting';
      tags.push('sitting');
    } else {
      poseBase = 'standing';
      tags.push('standing');
    }
  }

  // Arms raised detection: arms are up if upper arm has significant Z elevation or X forward bend
  const leftArmUp = (leftArmDegZ < -55 || leftArmDegX < -55);
  const rightArmUp = (rightArmDegZ > 55 || rightArmDegX < -55);
  
  if (leftArmUp && rightArmUp) {
    tags.push('arms-raised');
  } else if (leftArmUp || rightArmUp) {
    tags.push('arm-raised');
  }

  // Torso twist / contrapposto
  if (Math.abs(spineDegY) > 15 || Math.abs(chestDegY) > 15) {
    tags.push('contrapposto');
  }
  
  // Dynamic stepping / running (thigh split in standing pose)
  if (poseBase === 'standing') {
    const thighSplit = Math.abs(leftThighDegX - rightThighDegX);
    if (thighSplit > 40) {
      tags.push('running');
    }
  }

  // Fallback tag if empty
  if (tags.length === 0) {
    tags.push('standing');
  }

  return {
    base: poseBase,
    tags: tags
  };
}

function pinReferenceImage(url) {
  const card = document.getElementById('pinned-reference-card');
  const img = document.getElementById('pinned-reference-img');
  
  if (card && img) {
    img.src = url;
    card.style.display = 'flex';
    
    // Position card under presets
    card.style.top = '80px';
    card.style.right = '20px';
    card.style.left = 'auto';
    card.style.bottom = 'auto';
    
    // Enable dragging for this card!
    makeDraggable(card);
  }
}

function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = element.querySelector('.pinned-card-header') || element;
  
  header.onmousedown = dragMouseDown;
  header.ontouchstart = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    if (e.target.closest('#btn-close-pinned-card')) return;
    
    e.preventDefault();
    if (e.type === 'touchstart') {
      pos3 = e.touches[0].clientX;
      pos4 = e.touches[0].clientY;
      document.ontouchend = closeDragElement;
      document.ontouchmove = elementDrag;
    } else {
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    
    let clientX, clientY;
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    pos1 = pos3 - clientX;
    pos2 = pos4 - clientY;
    pos3 = clientX;
    pos4 = clientY;
    
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.bottom = "auto";
    element.style.right = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    document.ontouchend = null;
    document.ontouchmove = null;
  }
}

function reverseSearchPose() {
  const btn = document.getElementById('btn-lens-canvas');
  const originalText = btn ? btn.innerHTML : 'Lens Search Pose';
  
  if (btn) {
    btn.innerHTML = `
      <div class="reference-spinner" style="width:10px; height:10px; border-width:1px; margin-right:4px;"></div>
      Uploading...
    `;
    btn.style.pointerEvents = 'none';
  }

  // 1. Capture WebGL canvas snapshot (hiding joint helpers first)
  const oldSpheresVisible = state.jointSpheres.map(s => s.visible);
  state.jointSpheres.forEach(s => s.visible = false);
  
  if (state.skeletonLines && !state.skeletonVisible) {
    state.skeletonLines.visible = false;
  }
  
  // Force a clean frame render
  state.renderer.render(state.scene, state.camera);
  
  let dataURL;
  try {
    dataURL = state.renderer.domElement.toDataURL('image/png');
  } catch (err) {
    console.error('Failed to capture canvas screenshot:', err);
    alert('Failed to capture pose screenshot for visual search.');
    restoreState();
    return;
  }
  
  function restoreState() {
    state.jointSpheres.forEach((s, idx) => s.visible = oldSpheresVisible[idx]);
    if (state.skeletonLines && state.skeletonVisible) {
      state.skeletonLines.visible = true;
    }
    if (btn) {
      btn.innerHTML = originalText;
      btn.style.pointerEvents = 'auto';
    }
  }

  restoreState(); // Restore overlays immediately so user can keep posing

  // 2. Convert Data URL to binary Blob
  let blob;
  try {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    blob = new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('Blob conversion failed:', err);
    alert('Visual search failed during preparation.');
    return;
  }

  // 3. Upload to keyless CORS-friendly file hosting
  const formData = new FormData();
  formData.append('file', blob, 'pose_ref_' + Date.now() + '.png');

  if (btn) {
    btn.innerHTML = `
      <div class="reference-spinner" style="width:10px; height:10px; border-width:1px; margin-right:4px;"></div>
      Visual Searching...
    `;
    btn.style.pointerEvents = 'none';
  }

  fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error('Upload server returned error ' + res.status);
    return res.json();
  })
  .then(json => {
    if (json.status === 'success' && json.data && json.data.url) {
      // tmpfiles.org format is https://tmpfiles.org/12345/filename
      // We convert it to direct download URL: https://tmpfiles.org/dl/12345/filename
      const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      console.log("Uploaded snapshot successfully! Direct URL:", directUrl);
      
      // 4. Open Google Lens reverse image search in a new tab!
      const googleLensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(directUrl)}`;
      window.open(googleLensUrl, '_blank');
    } else {
      throw new Error('Invalid JSON format from upload server');
    }
  })
  .catch(err => {
    console.error('Visual search upload failed:', err);
    alert('An anonymous upload issue occurred. Google Lens is unavailable. Try standard text search!');
  })
  .finally(() => {
    if (btn) {
      btn.innerHTML = originalText;
      btn.style.pointerEvents = 'auto';
    }
  });
}

function executeGoogleSearch() {
  const refSearchInput = document.getElementById('reference-search-input');
  const clean = refSearchInput ? refSearchInput.value.trim() : 'standing';
  
  // 1. Detect primary pose
  let primaryPose = 'standing';
  let poseCheck = clean.toLowerCase();
  if (poseCheck.includes('sitting') || poseCheck.includes('seated') || poseCheck.includes('sit')) {
    primaryPose = 'sitting';
  } else if (poseCheck.includes('running') || poseCheck.includes('run')) {
    primaryPose = 'running';
  } else if (poseCheck.includes('jumping') || poseCheck.includes('jump') || poseCheck.includes('leap')) {
    primaryPose = 'jumping';
  } else if (poseCheck.includes('lying') || poseCheck.includes('reclining') || poseCheck.includes('recline')) {
    primaryPose = 'lying';
  } else if (poseCheck.includes('kneeling') || poseCheck.includes('kneel')) {
    primaryPose = 'kneeling';
  } else if (poseCheck.includes('crouching') || poseCheck.includes('crouch') || poseCheck.includes('squatting')) {
    primaryPose = 'crouching';
  } else if (poseCheck.includes('standing') || poseCheck.includes('stand')) {
    primaryPose = 'standing';
  } else if (poseCheck.includes('contrapposto') || poseCheck.includes('twist')) {
    primaryPose = 'contrapposto';
  }
  
  // 2. Build search words list
  const searchWords = [];
  
  // Gender
  if (poseCheck.includes('female') || poseCheck.includes('woman') || poseCheck.includes('girl')) {
    searchWords.push('female');
  } else if (poseCheck.includes('male') || poseCheck.includes('man') || poseCheck.includes('boy')) {
    searchWords.push('male');
  }
  
  // Pose
  searchWords.push(primaryPose);
  
  // Style mapping for Google Images
  const activeStyle = state.selectedStyle || 'all';
  if (activeStyle === 'drawing') {
    searchWords.push('life drawing sketch croquis');
  } else if (activeStyle === 'sculpture') {
    searchWords.push('classical sculpture museum');
  } else if (activeStyle === 'photo') {
    searchWords.push('art model photography pose');
  } else {
    searchWords.push('pose reference');
  }
  
  // Nudes check
  if (state.includeArtisticNudes) {
    searchWords.unshift('nude'); // Place 'nude' at the front for maximum search priority!
  }
  
  // Add any custom extra terms user typed
  let cleanWords = poseCheck
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\bmatch pose\b/g, '')
    .replace(/\bstanding|sitting|seated|running|jumping|kneeling|crouching|lying|reclining|contrapposto|male|female|woman|man|nude|pose|reference|drawing|sculpture|statue|model\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
    
  if (cleanWords) {
    searchWords.push(cleanWords);
  }
  
  // Negative filters to get clean human gestures and exclude cartoons/scenery
  searchWords.push('-anime -cartoon -illustration -clipart -drawing-lessons -sketchbook-cover');
  
  const googleQuery = searchWords.join(' ');
  console.log("Google Images query compiled:", googleQuery);
  
  // Open in new tab on Google Images
  const url = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(googleQuery);
  window.open(url, '_blank');
}

function triggerAutoMatchPose() {
  const appInterface = document.querySelector('.app-interface');
  if (appInterface && appInterface.classList.contains('has-reference-sidebar')) {
    const description = describeActivePose();
    const refSearchInput = document.getElementById('reference-search-input');
    if (refSearchInput) {
      refSearchInput.value = "Match Pose: " + description;
    }
    fetchWikimediaReferences(description);
  }
}

// Kick off initialization
window.onload = init;
