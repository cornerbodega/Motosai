// Script to inspect gas station GLB model structure
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const loader = new GLTFLoader();

const filePath = join(__dirname, "public/models/gas-station/gas-station.glb");
const fileURL = pathToFileURL(filePath).href;

loader.load(
  fileURL,
  (gltf) => {
    const model = gltf.scene || gltf.scenes[0];

    // Function to recursively print object hierarchy with indentation
    function printHierarchy(obj, indent = 0) {
      const prefix = "  ".repeat(indent);
      const type = obj.isMesh ? "Mesh" : obj.isGroup ? "Group" : obj.type;

      if (obj.isMesh && obj.material) {
        const mat = obj.material;
        if (mat.color) {
        }
      }

      obj.children.forEach((child) => printHierarchy(child, indent + 1));
    }

    printHierarchy(model);

    model.traverse((child) => {
      if (child.isMesh) {
      }
    });

    process.exit(0);
  },
  undefined,
  (err) => {
    console.error("Failed to load gas station model:", err);
    process.exit(1);
  }
);
