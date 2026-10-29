"""
    python check_python.py

Run this first if the install fails. It names the problem rather than leaving
you to interpret a pip resolver message — "from versions: none" reads like a
missing package when it actually means no build exists for your Python.
"""

import platform
import sys

major, minor = sys.version_info[:2]
bits = platform.architecture()[0]

print(f"\nPython  {sys.version.split()[0]}  ({bits}, {platform.system()})")
print(f"Path    {sys.executable}\n")

problems = []

if (major, minor) < (3, 10):
    problems.append(
        f"Python {major}.{minor} is too old. TensorFlow needs 3.10 or newer."
    )
elif (major, minor) > (3, 12):
    problems.append(
        f"Python {major}.{minor} has no TensorFlow wheels yet — this is almost\n"
        f"    certainly your error. Install 3.12 from python.org, then:\n\n"
        f"        py -3.12 -m venv .venv\n"
        f"        .venv\\Scripts\\activate\n"
        f"        pip install -r requirements.txt"
    )

if bits != "64bit":
    problems.append("TensorFlow is 64-bit only. You are running a 32-bit Python.")

if problems:
    for p in problems:
        print(f"  ✗ {p}\n")
    sys.exit(1)

print("  ✓ This Python can run TensorFlow.\n")

# Only worth checking once the interpreter itself is viable.
try:
    import tensorflow as tf  # noqa: F401
    import keras

    print(f"  ✓ tensorflow {tf.__version__}, keras {keras.__version__}")
    if int(keras.__version__.split(".")[0]) < 3:
        print("  ✗ Keras 2 cannot read the bundled .keras files. Need TensorFlow 2.16+.")
        sys.exit(1)
    print("\n  Ready. Start the classifier with: python server.py\n")
except ImportError:
    print("  · TensorFlow not installed yet — run: pip install -r requirements.txt\n")
