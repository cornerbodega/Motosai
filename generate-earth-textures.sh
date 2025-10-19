#!/bin/bash

# Script to generate lower resolution earth textures for mobile devices
# Requires ImageMagick or sips (macOS) to resize images

echo "Earth Texture Resolution Generator"
echo "=================================="
echo ""
echo "This script helps generate lower resolution earth textures for mobile devices."
echo ""
echo "Original textures needed (download from NASA or other sources):"
echo "- earth_color_10K.png (or any high-res earth color map)"
echo "- earth_landocean_4K.png (or any earth land/ocean mask)"
echo "- topography_5K.png (or any earth topography/height map)"
echo ""
echo "This will generate:"
echo "- earth_color_2K.png (mobile)"
echo "- earth_color_4K.png (desktop)"
echo "- earth_landocean_2K.png (both mobile and desktop)"
echo "- topography_2K.png (both mobile and desktop)"
echo ""
echo "Place your source images in ./earth_textures_source/"
echo ""

# Create directories if they don't exist
mkdir -p earth_textures_source
mkdir -p earth_textures_output

# Check if source directory has files
if [ ! "$(ls -A earth_textures_source)" ]; then
    echo "ERROR: No source images found in earth_textures_source/"
    echo "Please add your high-resolution earth textures there first."
    exit 1
fi

echo "Processing textures..."

# Function to resize image using sips (macOS) or ImageMagick
resize_image() {
    input=$1
    output=$2
    width=$3

    if command -v sips &> /dev/null; then
        # macOS sips command
        sips -Z $width "$input" --out "$output"
    elif command -v convert &> /dev/null; then
        # ImageMagick convert command
        convert "$input" -resize ${width}x ${output}
    else
        echo "ERROR: Neither sips nor ImageMagick found. Please install ImageMagick:"
        echo "  macOS: brew install imagemagick"
        echo "  Linux: apt-get install imagemagick"
        exit 1
    fi
}

# Process earth color texture
if [ -f "earth_textures_source/earth_color_10K.png" ]; then
    echo "Creating earth_color_4K.png..."
    resize_image "earth_textures_source/earth_color_10K.png" "earth_textures_output/earth_color_4K.png" 4096

    echo "Creating earth_color_2K.png..."
    resize_image "earth_textures_source/earth_color_10K.png" "earth_textures_output/earth_color_2K.png" 2048
else
    echo "WARNING: earth_color_10K.png not found"
fi

# Process land/ocean mask
if [ -f "earth_textures_source/earth_landocean_4K.png" ]; then
    echo "Creating earth_landocean_2K.png..."
    resize_image "earth_textures_source/earth_landocean_4K.png" "earth_textures_output/earth_landocean_2K.png" 2048
else
    echo "WARNING: earth_landocean_4K.png not found"
fi

# Process topography map
if [ -f "earth_textures_source/topography_5K.png" ]; then
    echo "Creating topography_2K.png..."
    resize_image "earth_textures_source/topography_5K.png" "earth_textures_output/topography_2K.png" 2048
else
    echo "WARNING: topography_5K.png not found"
fi

echo ""
echo "Done! Generated textures are in earth_textures_output/"
echo ""
echo "To upload to Google Cloud Storage:"
echo "gsutil cp earth_textures_output/*.png gs://motosai-app/textures/earth/"
echo ""
echo "File sizes:"
ls -lh earth_textures_output/