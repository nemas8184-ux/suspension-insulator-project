/**
 * Automated Mathematical Verification Suite
 * Tests lumped-capacitance nodal analysis, closed-form textbook solutions,
 * K = 0 uniform distribution, disc count scaling, and voltage conservation.
 *
 * Works both in the browser (via index.html) and in Node.js (`node tests.js`).
 */

(function (root) {
  'use strict';

  function approxEqual(actual, expected, tolerance, label) {
    var diff = Math.abs(actual - expected);
    if (diff > tolerance) {
      throw new Error(
        label + ': expected ' + expected.toFixed(8) + ', got ' + actual.toFixed(8) + ' (diff ' + diff.toExponential(2) + ')'
      );
    }
  }

  function runInsulatorTests(solveFn) {
    if (typeof solveFn !== 'function') {
      throw new Error('Solver function solveInsulatorString is not available.');
    }

    var results = [];

    function testCase(name, fn) {
      try {
        var detail = fn();
        results.push({ name: name, passed: true, detail: detail || 'Verified' });
      } catch (err) {
        results.push({ name: name, passed: false, detail: err.message });
      }
    }

    // 1. Uniform distribution when K = 0 across multiple disc counts
    testCase('Uniform Distribution (K = 0) across n = 2..15', function () {
      var counts = [2, 3, 5, 8, 12, 15];
      counts.forEach(function (n) {
        var V = 132;
        var res = solveFn(n, V, 0);
        var expectedDiscV = V / n;
        approxEqual(res.stringEfficiency, 100, 1e-9, 'Efficiency n=' + n);
        approxEqual(res.conservationError, 0, 1e-9, 'Conservation n=' + n);
        res.discs.forEach(function (d) {
          approxEqual(d.voltage, expectedDiscV, 1e-9, 'Disc ' + d.index + ' n=' + n);
        });
      });
      return 'All discs equal V/n and efficiency = 100.00% for n = 2, 3, 5, 8, 12, 15';
    });

    // 2. Single disc edge case (n = 1)
    testCase('Single Disc Edge Case (n = 1)', function () {
      var res = solveFn(1, 33, 0.25);
      approxEqual(res.discs[0].voltage, 33, 1e-9, 'Single disc voltage');
      approxEqual(res.stringEfficiency, 100, 1e-9, 'Single disc efficiency');
      approxEqual(res.conservationError, 0, 1e-9, 'Single disc conservation');
      return 'Single disc carries 100% of 33 kV regardless of K; efficiency = 100%';
    });

    // 3. Closed-form analytical verification for n = 3, K = 0.10, V = 100 kV
    // Textbook: v1 = V / (3 + 4K + K^2), v2 = (1 + K)v1, v3 = (1 + 3K + K^2)v1
    testCase('Closed-Form Analytical Check (n = 3, K = 0.10)', function () {
      var V = 100;
      var K = 0.1;
      var res = solveFn(3, V, K);
      var denom = 3 + 4 * K + K * K; // 3.41
      var v1 = V / denom;
      var v2 = (1 + K) * v1;
      var v3 = (1 + 3 * K + K * K) * v1;
      var eff = (V / (3 * v3)) * 100;

      approxEqual(res.discs[0].voltage, v1, 1e-9, 'n=3 v1');
      approxEqual(res.discs[1].voltage, v2, 1e-9, 'n=3 v2');
      approxEqual(res.discs[2].voltage, v3, 1e-9, 'n=3 v3');
      approxEqual(res.stringEfficiency, eff, 1e-9, 'n=3 efficiency');
      return 'v1=' + v1.toFixed(4) + ' kV, v2=' + v2.toFixed(4) + ' kV, v3=' + v3.toFixed(4) + ' kV, eta=' + eff.toFixed(2) + '%';
    });

    // 4. Closed-form analytical verification for n = 4, K = 0.15, V = 66 kV
    // v1 = V / (4 + 10K + 6K^2 + K^3)
    testCase('Closed-Form Analytical Check (n = 4, K = 0.15)', function () {
      var V = 66;
      var K = 0.15;
      var res = solveFn(4, V, K);
      var S4 = 4 + 10 * K + 6 * K * K + K * K * K;
      var v1 = V / S4;
      var v2 = (1 + K) * v1;
      var v3 = (1 + 3 * K + K * K) * v1;
      var v4 = (1 + 6 * K + 5 * K * K + K * K * K) * v1;

      approxEqual(res.discs[0].voltage, v1, 1e-9, 'n=4 v1');
      approxEqual(res.discs[1].voltage, v2, 1e-9, 'n=4 v2');
      approxEqual(res.discs[2].voltage, v3, 1e-9, 'n=4 v3');
      approxEqual(res.discs[3].voltage, v4, 1e-9, 'n=4 v4');
      approxEqual(res.conservationError, 0, 1e-9, 'n=4 conservation');
      return 'Exact match to polynomial closed-form (v4=' + v4.toFixed(4) + ' kV, eta=' + res.stringEfficiency.toFixed(2) + '%)';
    });

    // 5. Voltage conservation across broad parameter matrix
    testCase('Voltage Conservation (Sum of v_i = V)', function () {
      var discCases = [2, 4, 5, 7, 10, 15];
      var voltages = [11, 38.1, 76.2, 127, 230.9, 440];
      var ratios = [0, 0.05, 0.12, 0.25, 0.5];
      var maxErr = 0;

      discCases.forEach(function (n) {
        voltages.forEach(function (V) {
          ratios.forEach(function (K) {
            var res = solveFn(n, V, K);
            if (res.conservationError > maxErr) {
              maxErr = res.conservationError;
            }
            approxEqual(res.voltageSum, V, 1e-9, 'Sum n=' + n + ', V=' + V + ', K=' + K);
            approxEqual(
              res.discs.reduce(function (acc, d) { return acc + d.percentage; }, 0),
              100,
              1e-8,
              'Percentage sum'
            );
          });
        });
      });
      return '180 parameter combinations verified; max residual error = ' + maxErr.toExponential(2) + ' kV';
    });

    // 6. Monotonic voltage increase toward conductor when K > 0
    testCase('Monotonic Stress Increase Toward Conductor (K > 0)', function () {
      var res = solveFn(10, 127, 0.14);
      for (var i = 1; i < res.discs.length; i++) {
        if (!(res.discs[i].voltage > res.discs[i - 1].voltage)) {
          throw new Error('Expected v_' + (i + 1) + ' > v_' + i);
        }
      }
      if (!(res.stringEfficiency > 0 && res.stringEfficiency < 100)) {
        throw new Error('Expected 0 < eta < 100 for K > 0, n > 1');
      }
      return 'Strictly increasing v_1 < v_2 < ... < v_10; eta = ' + res.stringEfficiency.toFixed(2) + '%';
    });

    // 7. String efficiency decreases as K increases (fixed n > 1)
    testCase('String Efficiency Decreases with Increasing K', function () {
      var prevEta = 100.0001;
      [0, 0.05, 0.1, 0.2, 0.35, 0.5].forEach(function (K) {
        var res = solveFn(6, 76.2, K);
        if (!(res.stringEfficiency < prevEta)) {
          throw new Error('Efficiency did not strictly decrease at K=' + K);
        }
        prevEta = res.stringEfficiency;
      });
      return 'Verified eta(0) > eta(0.05) > ... > eta(0.50) for n = 6';
    });

    var passedCount = results.filter(function (r) { return r.passed; }).length;
    return {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      results: results
    };
  }

  root.runInsulatorTests = runInsulatorTests;

  // Allow direct execution in Node.js: `node tests.js`
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runInsulatorTests: runInsulatorTests };
    if (require.main === module) {
      var solver = require('./script.js').solveInsulatorString;
      var summary = runInsulatorTests(solver);
      console.log('=== Insulator Voltage Gradient Verification ===');
      summary.results.forEach(function (item) {
        console.log((item.passed ? '[PASS] ' : '[FAIL] ') + item.name + ' -> ' + item.detail);
      });
      console.log('Summary: ' + summary.passed + '/' + summary.total + ' passed.');
      if (summary.failed > 0) {
        process.exit(1);
      }
    }
  }
})(typeof window !== 'undefined' ? window : global);
