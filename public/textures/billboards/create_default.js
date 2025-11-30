const fs = require("fs");
const { createCanvas } = require("canvas");

const canvas = createCanvas(1024, 512);
const ctx = canvas.getContext("2d");

// Background gradient (desert sunset colors)
const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
gradient.addColorStop(0, "#ff6b35"); // Orange
gradient.addColorStop(0.5, "#f7931e"); // Yellow-orange
gradient.addColorStop(1, "#fdc830"); // Yellow
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Add border
ctx.strokeStyle = "#333";
ctx.lineWidth = 10;
ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

// Add text
ctx.fillStyle = "#fff";
ctx.strokeStyle = "#000";
ctx.lineWidth = 8;
ctx.font = "bold 120px Arial";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

const text = "MOTOSAI";
ctx.strokeText(text, canvas.width / 2, canvas.height / 2 - 60);
ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 60);

// Subtitle
ctx.font = "bold 60px Arial";
ctx.strokeStyle = "#000";
ctx.lineWidth = 4;
const subtitle = "Death Valley Racing";
ctx.strokeText(subtitle, canvas.width / 2, canvas.height / 2 + 60);
ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 60);

// Save to PNG
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync("default.png", buffer);
