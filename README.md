# Mapping Voltage Gradient Across a String of Suspension Insulators

An interactive B.Tech Electrical Engineering educational simulation demonstrating non-uniform AC voltage distribution and string efficiency across high-voltage suspension insulator strings.

> **Educational Simulation Notice:** All voltage values, gradients, and efficiencies are computed analytically from an ideal lumped-capacitance steady-state AC circuit model. This project is a mathematical simulation for academic learning, not a physical high-voltage laboratory test.

---

## Key Features

- **Interactive 3D Suspension Insulator String (`Three.js`):**
  - Realistic revolved porcelain/glass disc geometry with underside petticoat ribs, galvanized cap-and-pin hardware, grounded tower cross-arm assembly, and energized bottom HV conductor.
  - Orbit, pan, and zoom controls (`OrbitControls`) with auto-framing and camera reset.
  - Dynamic voltage-stress color heatmap across discs plus click/hover disc inspection.
  - Switchable Ceramic (Glazed Porcelain) and Toughened Glass styles.
- **Mathematically Consistent Nodal Analysis Solver:**
  - Models self-capacitance $C$ across each disc and stray shunt capacitance $C_1 = K \cdot C$ from intermediate metal pins to the grounded tower.
  - Solves $-V_{i-1} + (2 + K)V_i - V_{i+1} = 0$ via the $O(n)$ Thomas tridiagonal algorithm with boundary conditions $V_0 = 0$ and $V_n = V$.
  - Computes individual disc voltages ($v_i = V_i - V_{i-1}$), percentage distribution, stress factors, and string efficiency ($\eta = \frac{V}{n \cdot v_n} \times 100\%$), strictly preserving $\sum v_i = V$.
- **Interactive Graphs & Analytics (`Chart.js`):**
  - **Disc Voltages:** Bar chart comparing actual disc stress (in `kV` or `%`) against the ideal uniform distribution ($V/n$), plus optional pinned scenario comparison.
  - **Node Potentials:** Cumulative junction potential curve ($V_0 \dots V_n$) vs linear uniform profile.
  - **Efficiency Sensitivity ($\eta$ vs $K$):** Parametric curve showing string efficiency degradation as shunt capacitance ratio $K$ increases.
- **Full Academic Report Sections:**
  - Introduction, Project Objectives, Working Principle, Mathematical Model (with circuit diagram), Applications, Results & Discussion, Conclusion, and References.
- **Automated Verification Suite (`tests.js`):**
  - Built-in browser test runner and Node-compatible verification script validating closed-form analytical textbook cases, the $K = 0$ uniform baseline, varying disc counts, and voltage conservation.

---

## Project Structure

```text
suspension-insulator-project/
├── index.html   # Main dashboard, 3D canvas, charts, table, theory & verification sections
├── style.css    # Responsive academic engineering dashboard styling
├── script.js    # Nodal solver, Three.js 3D scene, Chart.js graphs & UI controller
├── tests.js     # Automated mathematical verification suite (browser & Node.js)
└── README.md    # Documentation and local setup instructions
```

---

## How to Run Locally

Because `index.html` uses standard browser scripts (`Three.js` UMD, `OrbitControls`, and `Chart.js` UMD via jsDelivr CDN), you can run it in either of two ways:

1. **Direct Browser Open:**
   Double-click `index.html` (or open `file:///.../index.html` in Chrome, Edge, or Firefox). *(Requires internet access for the CDN libraries.)*
2. **Local Static Server (Recommended):**
   Serve the folder with any static HTTP server (e.g., VS Code **Live Server**, `python -m http.server 8080`, or `npx serve .`) and open `http://localhost:8080`.

### Running Verification Tests
- **In the Browser:** Scroll to the **Mathematical Verification Suite** section at the bottom of `index.html` (runs automatically on load, or click **Run Verification Tests**).
- **Via Node.js (optional):**
  ```bash
  node tests.js
  ```

---

## Mathematical Summary

For an $n$-disc suspension string with applied phase-to-ground voltage $V$ and capacitance ratio $K = C_1 / C$:

1. **KCL at intermediate node $i \in \{1, \dots, n-1\}$:**
   $$-V_{i-1} + (2 + K)V_i - V_{i+1} = 0, \quad V_0 = 0, \quad V_n = V$$
2. **Disc voltage across unit $i$:**
   $$v_i = V_i - V_{i-1}$$
3. **Voltage conservation:**
   $$\sum_{i=1}^{n} v_i = V_n - V_0 = V$$
4. **String efficiency:**
   $$\eta = \frac{V}{n \cdot v_n} \times 100\%$$
