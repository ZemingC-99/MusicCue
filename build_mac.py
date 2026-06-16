import os
import subprocess
import shutil
import sys

def build():
    print("=== Step 1: Running PyInstaller ===")
    
    # We define the pyinstaller executable in the virtual environment
    venv_pyinstaller = os.path.join(".venv", "bin", "pyinstaller")
    if not os.path.exists(venv_pyinstaller):
        # Fallback to system pyinstaller
        venv_pyinstaller = "pyinstaller"

    cmd = [
        venv_pyinstaller,
        "--name=MusicCue",
        "--noconsole",
        "--clean",
        "--noconfirm",
        "--icon=resources/MusicCue.icns",
        "--add-data=static:static",
        "--add-data=resources/shortcuts:resources/shortcuts",
        "app.py"
    ]
    
    print("Running command:", " ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Error: PyInstaller build failed.")
        sys.exit(1)
        
    print("=== Step 2: Creating DMG ===")
    # Define directories
    dist_dir = "dist"
    app_path = os.path.join(dist_dir, "MusicCue.app")
    dmg_name = "MusicCue.dmg"
    dmg_path = os.path.join(dist_dir, dmg_name)
    
    # Clean old dmg if exists
    if os.path.exists(dmg_path):
        os.remove(dmg_path)
        
    # Create temporary directory for dmg contents
    dmg_temp_dir = os.path.join(dist_dir, "dmg_temp")
    if os.path.exists(dmg_temp_dir):
        shutil.rmtree(dmg_temp_dir)
    os.makedirs(dmg_temp_dir)
    
    # Copy .app to dmg temp directory
    print(f"Copying {app_path} to {dmg_temp_dir}...")
    shutil.copytree(app_path, os.path.join(dmg_temp_dir, "MusicCue.app"), symlinks=True)
    
    # Create symbolic link to /Applications
    print("Creating symbolic link to /Applications...")
    os.symlink("/Applications", os.path.join(dmg_temp_dir, "Applications"))
    
    # Copy MusicCue.shortcut to DMG root directory
    print("Copying MusicCue.shortcut to DMG root...")
    shortcut_src = os.path.join("resources", "shortcuts", "MusicCue.shortcut")
    if os.path.exists(shortcut_src):
        shutil.copy(shortcut_src, os.path.join(dmg_temp_dir, "MusicCue.shortcut"))
    
    # Call native hdiutil to build read-only DMG
    print("Running hdiutil to create DMG...")
    hdiutil_cmd = [
        "hdiutil", "create",
        "-volname", "MusicCue",
        "-srcfolder", dmg_temp_dir,
        "-ov",
        "-format", "UDZO",
        dmg_path
    ]
    
    print("Running hdiutil command:", " ".join(hdiutil_cmd))
    hdiutil_result = subprocess.run(hdiutil_cmd)
    
    # Clean up temp folder
    shutil.rmtree(dmg_temp_dir)
    
    if hdiutil_result.returncode == 0:
        print(f"\nSUCCESS! Created DMG file at: {os.path.abspath(dmg_path)}")
    else:
        print("Error: hdiutil failed to create DMG.")
        sys.exit(1)

if __name__ == "__main__":
    build()
