/**
 * Procedural Voxel Art Generator for the Ape Models.
 * Generates coordinate matrices for a 64x64x64 voxel space.
 * All coordinates range from 0 to 63.
 */

class VoxelBuilder {
  constructor() {
    this.voxels = new Map(); // key: "x,y,z", value: { color, type }
  }

  set(x, y, z, color, type = 'solid') {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (x < 0 || x >= 64 || y < 0 || y >= 64 || z < 0 || z >= 64) return;
    const key = `${x},${y},${z}`;
    this.voxels.set(key, { color, type });
  }

  get(x, y, z) {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    return this.voxels.get(key);
  }

  delete(x, y, z) {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    this.voxels.delete(key);
  }

  // Draw a solid box/cuboid
  box(x1, y1, z1, x2, y2, z2, color, type = 'solid', jitterAmt = 0) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(63, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(63, Math.max(y1, y2));
    const minZ = Math.max(0, Math.min(z1, z2));
    const maxZ = Math.min(63, Math.max(z1, z2));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          let finalColor = color;
          if (jitterAmt > 0) {
            finalColor = this.applyJitter(color, jitterAmt);
          }
          this.set(x, y, z, finalColor, type);
        }
      }
    }
  }

  // Draw a solid ellipsoid
  ellipsoid(cx, cy, cz, rx, ry, rz, color, type = 'solid', jitterAmt = 0) {
    const minX = Math.max(0, Math.floor(cx - rx));
    const maxX = Math.min(63, Math.ceil(cx + rx));
    const minY = Math.max(0, Math.floor(cy - ry));
    const maxY = Math.min(63, Math.ceil(cy + ry));
    const minZ = Math.max(0, Math.floor(cz - rz));
    const maxZ = Math.min(63, Math.ceil(cz + rz));

    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx > 1) continue;
      for (let y = minY; y <= maxY; y++) {
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        for (let z = minZ; z <= maxZ; z++) {
          const dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) {
            let finalColor = color;
            if (jitterAmt > 0) {
              finalColor = this.applyJitter(color, jitterAmt);
            }
            this.set(x, y, z, finalColor, type);
          }
        }
      }
    }
  }

  // Draw a cylinder along the Y axis
  cylinderY(cx, cy, cz, radius, height, color, type = 'solid', jitterAmt = 0) {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(63, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - height / 2));
    const maxY = Math.min(63, Math.ceil(cy + height / 2));
    const minZ = Math.max(0, Math.floor(cz - radius));
    const maxZ = Math.min(63, Math.ceil(cz + radius));

    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      for (let z = minZ; z <= maxZ; z++) {
        const dz = z - cz;
        if (dx * dx + dz * dz <= radius * radius) {
          for (let y = minY; y <= maxY; y++) {
            let finalColor = color;
            if (jitterAmt > 0) {
              finalColor = this.applyJitter(color, jitterAmt);
            }
            this.set(x, y, z, finalColor, type);
          }
        }
      }
    }
  }

  // Draw a cylinder along the X axis
  cylinderX(cx, cy, cz, radius, length, color, type = 'solid', jitterAmt = 0) {
    const minX = Math.max(0, Math.floor(cx - length / 2));
    const maxX = Math.min(63, Math.ceil(cx + length / 2));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(63, Math.ceil(cy + radius));
    const minZ = Math.max(0, Math.floor(cz - radius));
    const maxZ = Math.min(63, Math.ceil(cz + radius));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      for (let z = minZ; z <= maxZ; z++) {
        const dz = z - cz;
        if (dy * dy + dz * dz <= radius * radius) {
          for (let x = minX; x <= maxX; x++) {
            let finalColor = color;
            if (jitterAmt > 0) {
              finalColor = this.applyJitter(color, jitterAmt);
            }
            this.set(x, y, z, finalColor, type);
          }
        }
      }
    }
  }

  // Apply a small color jitter to look like texturized voxels
  applyJitter(color, amount) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const jitter = Math.floor((Math.random() - 0.5) * amount * 2);
    const newR = Math.max(0, Math.min(255, r + jitter));
    const newG = Math.max(0, Math.min(255, g + jitter));
    const newB = Math.max(0, Math.min(255, b + jitter));

    return (newR << 16) | (newG << 8) | newB;
  }

  // Get active voxels list
  getVoxels() {
    const list = [];
    for (const [key, val] of this.voxels.entries()) {
      const [x, y, z] = key.split(',').map(Number);
      list.push({ x, y, z, color: val.color, type: val.type });
    }
    return list;
  }
}

// Global organic color presets
const organicColors = {
  cBrown: 0x5a3321,      // Base fur brown
  cLightBrown: 0x77472e, // Highlight fur brown
  cTan: 0xdfa076,        // Skin tan (muzzle, chest, hands, feet)
  cDarkTan: 0xb87950,    // Shaded skin
  cWhite: 0xfbfcfc,      // Eyes white
  cBlack: 0x17202a       // Pupils / nose black
};

/**
 * Version 1: Classic Retro Ape (Donkey Kong style gorilla, no tie, with corrected visible eyes)
 */
export function generateClassicApe() {
  const builder = new VoxelBuilder();

  // Colors
  const { cBrown, cTan, cDarkTan, cWhite, cBlack } = organicColors;

  // --- Feet (Sitting on the floor, y = 0) ---
  builder.box(18, 0, 24, 26, 4, 36, cTan, 'solid', 10);
  builder.box(18, 0, 36, 26, 3, 39, cTan); // toes
  builder.box(37, 0, 24, 45, 4, 36, cTan, 'solid', 10);
  builder.box(37, 0, 36, 45, 3, 39, cTan); // toes

  // --- Legs ---
  builder.box(19, 4, 25, 25, 12, 33, cBrown, 'solid', 15);
  builder.box(38, 4, 25, 44, 12, 33, cBrown, 'solid', 15);

  // --- Torso / Hips ---
  builder.ellipsoid(32, 18, 28, 14, 8, 10, cBrown, 'solid', 12);
  builder.ellipsoid(32, 28, 30, 16, 10, 12, cBrown, 'solid', 15);
  
  // Belly/Chest skin patch
  builder.ellipsoid(32, 23, 38, 9, 8, 3, cTan, 'solid', 5);
  builder.ellipsoid(32, 29, 39, 10, 6, 2, cTan, 'solid', 5);

  // --- Heavy Arms (Hanging low to knuckles) ---
  // Left Arm
  builder.ellipsoid(17, 30, 30, 5, 6, 6, cBrown, 'solid', 12);
  builder.cylinderY(16, 20, 31, 4, 14, cBrown, 'solid', 15);
  builder.ellipsoid(15, 10, 33, 5, 8, 6, cBrown, 'solid', 12);
  builder.box(12, 0, 32, 18, 5, 38, cTan, 'solid', 8);

  // Right Arm
  builder.ellipsoid(47, 30, 30, 5, 6, 6, cBrown, 'solid', 12);
  builder.cylinderY(48, 20, 31, 4, 14, cBrown, 'solid', 15);
  builder.ellipsoid(49, 10, 33, 5, 8, 6, cBrown, 'solid', 12);
  builder.box(46, 0, 32, 52, 5, 38, cTan, 'solid', 8);

  // --- Head ---
  builder.ellipsoid(32, 44, 30, 11, 10, 10, cBrown, 'solid', 15);
  builder.ellipsoid(32, 54, 27, 4, 4, 5, cBrown, 'solid', 10);
  builder.ellipsoid(32, 52, 29, 6, 4, 6, cBrown, 'solid', 10);

  // Tan Face/Eye plate (Ensures a clean skin surface for eyes to sit on)
  builder.ellipsoid(32, 45, 38, 7, 5, 2, cTan);

  // Muzzle & Mouth (Set slightly forward)
  builder.ellipsoid(32, 40, 39, 8, 4.5, 3, cTan, 'solid', 5);
  builder.box(28, 38, 41, 36, 38, 42, cDarkTan); // mouth line
  builder.set(31, 41, 42, cBlack); // Nostrils
  builder.set(33, 41, 42, cBlack);

  // Brow Ridge (Set forward to overhang eyes)
  builder.box(24, 47, 37, 40, 48, 40, cBrown, 'solid', 10);

  // Eyes (Placed on the front of the face plate, visible!)
  // Left eye
  builder.box(26, 44, 39, 29, 46, 39, cWhite);
  builder.set(28, 45, 40, cBlack); // Left Pupil
  // Right eye
  builder.box(35, 44, 39, 38, 46, 39, cWhite);
  builder.set(36, 45, 40, cBlack); // Right Pupil

  // Ears
  builder.ellipsoid(21, 44, 28, 2, 4, 3, cBrown);
  builder.ellipsoid(21, 44, 28, 1, 3, 2, cTan);
  builder.ellipsoid(43, 44, 28, 2, 4, 3, cBrown);
  builder.ellipsoid(43, 44, 28, 1, 3, 2, cTan);

  return builder.getVoxels();
}

/**
 * Version 2: Cyber/Mecha Ape (Cyborg organic gorilla with robotic enhancements)
 */
export function generateCyberApe() {
  const builder = new VoxelBuilder();

  // Colors
  const { cBrown, cTan, cDarkTan, cWhite, cBlack } = organicColors;
  const cMetalDark = 0x1f232b;    // Cybernetic dark plates
  const cMetalLight = 0x566573;   // Light alloy panels
  const cSteel = 0xabb2b9;        // Piston steel rods
  const cNeonBlue = 0x00e5ff;     // Glowing blue circuit lines
  const cNeonPink = 0xff007f;     // Glowing pink nodes

  // --- Organic Legs with Cybernetic Boot Overlays ---
  builder.box(19, 4, 25, 25, 12, 33, cBrown, 'solid', 12);
  builder.box(38, 4, 25, 44, 12, 33, cBrown, 'solid', 12);
  // Left foot (Organic toes, cyber armor heel)
  builder.box(18, 0, 24, 26, 4, 32, cTan, 'solid', 8);
  builder.box(18, 0, 32, 26, 3, 39, cTan); // toes
  builder.box(17, 0, 23, 27, 3, 29, cMetalDark); // cyber sandal support
  builder.box(17, 2, 28, 27, 3, 29, cNeonBlue, 'emissive'); // glowing stripe

  // Right foot (Full cyber tracked boots for asymmetry!)
  builder.box(37, 0, 23, 46, 5, 36, cMetalDark);
  builder.box(38, 0, 36, 45, 4, 38, cMetalLight);
  builder.box(37, 2, 30, 46, 3, 31, cNeonBlue, 'emissive');

  // --- Torso (Organic base, Cybernetic Armor Vest overlay) ---
  builder.ellipsoid(32, 18, 28, 14, 8, 10, cBrown, 'solid', 12);
  builder.ellipsoid(32, 28, 30, 16, 10, 12, cBrown, 'solid', 15);
  // Chest skin (Partially visible)
  builder.ellipsoid(32, 23, 38, 9, 8, 3, cTan, 'solid', 5);
  
  // Cyber Armor Chestplate Vest overlay
  builder.box(24, 20, 37, 40, 30, 38, cMetalDark);
  builder.box(25, 21, 38, 39, 29, 39, cMetalLight);
  // Glowing chest plasma reactor
  builder.ellipsoid(32, 25, 39, 5, 5, 2, cNeonBlue, 'emissive');
  builder.ellipsoid(32, 25, 39, 3, 3, 3, 0xffffff, 'emissive'); // core center glow

  // --- Asymmetrical Cyborg Arms ---
  // Right Arm (Organic)
  builder.ellipsoid(47, 30, 30, 5, 6, 6, cBrown, 'solid', 12);
  builder.cylinderY(48, 20, 31, 4, 14, cBrown, 'solid', 15);
  builder.ellipsoid(49, 10, 33, 5, 8, 6, cBrown, 'solid', 12);
  builder.box(46, 0, 32, 52, 5, 38, cTan, 'solid', 8); // knuckles
  // Cybernetic wrist band on right arm
  builder.cylinderY(49, 8, 33, 5.2, 2, cMetalLight);
  builder.cylinderY(49, 8, 33, 5.4, 0.8, cNeonPink, 'emissive');

  // Left Arm (Robotic)
  builder.ellipsoid(15, 30, 30, 7, 7, 7, cMetalDark); // shoulder
  builder.ellipsoid(15, 30, 30, 8, 4, 8, cNeonBlue, 'emissive'); // glowing ring
  builder.cylinderY(14, 18, 31, 5, 14, cMetalLight);
  builder.cylinderY(12, 19, 31, 2, 12, cSteel); // piston
  builder.cylinderY(14, 10, 33, 6, 8, cMetalDark); // forearm
  builder.box(10, 0, 32, 19, 5, 39, cMetalLight); // knuckles
  builder.box(9, 1, 34, 10, 4, 38, cNeonPink, 'emissive'); // joint glow

  // --- Cybernetic Head ---
  // Base organic head
  builder.ellipsoid(32, 44, 30, 11, 10, 10, cBrown, 'solid', 15);
  builder.ellipsoid(32, 54, 27, 4, 4, 5, cBrown, 'solid', 10);
  
  // Muzzle (Organic mouth)
  builder.ellipsoid(32, 40, 39, 8, 4.5, 3, cTan, 'solid', 5);
  builder.box(28, 38, 41, 36, 38, 42, cDarkTan); // mouth line
  // Cybernetic chin plate
  builder.box(27, 36, 36, 37, 38, 39, cMetalLight);

  // Visor (Glowing blue visor covering the upper organic eyes, shifted forward so it is visible!)
  builder.box(23, 44, 38, 41, 48, 39, cMetalDark); // visor backing frame
  builder.box(24, 45, 40, 40, 47, 40, cNeonBlue, 'emissive'); // glowing visor bar
  builder.box(27, 46, 40, 37, 46, 41, 0xffffff, 'emissive'); // visor center highlight

  // Ears
  // Right Ear (Organic)
  builder.ellipsoid(43, 44, 28, 2, 4, 3, cBrown);
  builder.ellipsoid(43, 44, 28, 1, 3, 2, cTan);
  // Left Ear (Sensor headset)
  builder.box(20, 41, 27, 22, 47, 30, cMetalLight);
  builder.box(19, 43, 28, 19, 51, 28, cSteel);
  builder.set(19, 52, 28, cNeonPink, 'emissive');

  return builder.getVoxels();
}

/**
 * Version 3: Astronaut Ape (Organic gorilla inside a custom spacesuit helmet/pack)
 */
export function generateAstronautApe() {
  const builder = new VoxelBuilder();

  // Colors
  const { cBrown, cTan, cDarkTan, cWhite, cBlack } = organicColors;
  const cSuitWhite = 0xf2f3f4;    // White spacesuit fabric
  const cSuitShadow = 0xd5dbdb;   // Shaded space fabric
  const cRubberGray = 0x2c3e50;   // Dark grey gaskets/joints
  const cVisorGold = 0xf1c40f;    // Golden reflective visor (helmet)
  const cVisorHighlight = 0xfef9e7;// Gold highlight shine
  const cButtonRed = 0xe74c3c;    // Chest buttons
  const cButtonBlue = 0x3498db;   // Chest buttons

  // --- Organic Legs emerging into Space Boots ---
  builder.box(19, 7, 25, 25, 12, 33, cBrown, 'solid', 12);
  builder.box(38, 7, 25, 44, 12, 33, cBrown, 'solid', 12);
  // White Space Boots
  builder.box(17, 0, 23, 27, 4, 37, cSuitWhite);
  builder.box(17, 0, 23, 27, 1, 37, cRubberGray); // boot soles
  builder.box(36, 0, 23, 46, 4, 37, cSuitWhite);
  builder.box(36, 0, 23, 46, 1, 37, cRubberGray);

  // --- Torso: Organic Body wearing Spacesuit Chest Harness & Backpack ---
  builder.ellipsoid(32, 18, 28, 14, 8, 10, cBrown, 'solid', 12);
  builder.ellipsoid(32, 28, 30, 16, 10, 12, cBrown, 'solid', 15);
  builder.ellipsoid(32, 23, 38, 9, 8, 3, cTan, 'solid', 5);

  // Spacesuit Vest Harness
  builder.box(23, 18, 35, 41, 30, 38, cSuitWhite); // front panel
  builder.box(23, 18, 22, 41, 30, 25, cSuitWhite); // back panel
  builder.box(23, 26, 25, 26, 31, 35, cSuitWhite); // left strap
  builder.box(38, 26, 25, 41, 31, 35, cSuitWhite); // right strap

  // Chest life support box
  builder.box(26, 20, 38, 37, 27, 41, cRubberGray);
  builder.box(27, 21, 39, 36, 26, 41, cSuitWhite);
  builder.box(29, 23, 42, 31, 24, 42, cButtonRed);
  builder.box(33, 23, 42, 34, 24, 42, cButtonBlue);
  builder.set(30, 25, 42, 0x2ecc71);

  // Oxygen Tanks Backpack
  builder.cylinderY(27, 23, 19, 3.5, 14, cSuitWhite);
  builder.cylinderY(37, 23, 19, 3.5, 14, cSuitWhite);
  builder.box(26, 21, 20, 38, 25, 22, cRubberGray);

  // --- Organic Arms emerging from Spacesuit Sleeves ---
  builder.ellipsoid(16, 29, 29, 6.5, 6.5, 6.5, cSuitWhite);
  builder.ellipsoid(48, 29, 29, 6.5, 6.5, 6.5, cSuitWhite);
  
  builder.cylinderY(15, 22, 30, 4.5, 8, cSuitWhite);
  builder.cylinderY(49, 22, 30, 4.5, 8, cSuitWhite);
  builder.cylinderY(15, 17, 30, 4.8, 1.5, cRubberGray);
  builder.cylinderY(49, 17, 30, 4.8, 1.5, cRubberGray);

  // Forearms & Hands (Bare organic brown fur/tan hands)
  builder.cylinderY(15, 12, 31, 4.0, 10, cBrown, 'solid', 12);
  builder.box(12, 0, 32, 18, 5, 38, cTan, 'solid', 8);
  builder.cylinderY(49, 12, 31, 4.0, 10, cBrown, 'solid', 12);
  builder.box(46, 0, 32, 52, 5, 38, cTan, 'solid', 8);

  // --- Organic Head inside Space Helmet Accessory ---
  // Space collar neck seal
  builder.cylinderY(32, 36, 29, 8.5, 2.5, cRubberGray);
  builder.cylinderY(32, 38, 29, 9.0, 1.0, cSuitWhite);

  // Organic head inside helmet (Shifted slightly forward for visibility)
  builder.ellipsoid(32, 44, 29, 9, 8.5, 8.5, cBrown, 'solid', 15);
  builder.ellipsoid(32, 45, 35, 6, 4.5, 2, cTan); // Face plate
  builder.ellipsoid(32, 40, 36, 7, 4.5, 2.5, cTan, 'solid', 5); // Muzzle
  builder.box(29, 39, 37, 35, 39, 39, cDarkTan); // mouth
  builder.set(31, 41, 39, cBlack); // nose
  builder.set(33, 41, 39, cBlack);

  // Eyes (Shifted forward to z = 36 to sit clearly on the face plate)
  builder.box(25, 46, 34, 39, 47, 37, cBrown, 'solid', 10); // brow
  builder.box(27, 44, 36, 29, 45, 36, cWhite); // Left eye white
  builder.set(28, 44, 37, cBlack); // Left Pupil
  builder.box(35, 44, 36, 37, 45, 36, cWhite); // Right eye white
  builder.set(36, 44, 37, cBlack); // Right Pupil

  // Ears
  builder.ellipsoid(23, 44, 28, 1.5, 3, 2, cBrown);
  builder.ellipsoid(23, 44, 28, 1, 2.5, 1, cTan);
  builder.ellipsoid(41, 44, 28, 1.5, 3, 2, cBrown);
  builder.ellipsoid(41, 44, 28, 1, 2.5, 1, cTan);

  // Helmet Frame Structure
  builder.ellipsoid(32, 46, 25, 11, 10, 3, cSuitWhite);
  builder.ellipsoid(32, 46, 25, 11.5, 10.5, 3.2, cSuitShadow);
  builder.cylinderY(21, 46, 29, 1, 14, cSuitWhite);
  builder.cylinderY(43, 46, 29, 1, 14, cSuitWhite);
  builder.box(21, 53, 22, 43, 54, 25, cSuitWhite);
  builder.box(21, 53, 25, 43, 54, 29, cSuitWhite);

  // Flipped up Golden Visor (mounted high)
  builder.ellipsoid(32, 53, 34, 7.5, 3.5, 6, cVisorGold, 'visor');
  builder.ellipsoid(32, 53.5, 34, 8.0, 4.0, 6.2, cRubberGray);
  builder.ellipsoid(32, 53, 34, 7.5, 3.5, 6, cVisorGold, 'visor');
  builder.box(28, 54, 38, 30, 56, 38, cVisorHighlight, 'visor');

  return builder.getVoxels();
}
