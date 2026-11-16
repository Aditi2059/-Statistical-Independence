(function() {
    'use strict';

    const dataInput = document.getElementById('dataInput');
    const computeBtn = document.getElementById('computeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const loadExampleBtn = document.getElementById('loadExampleBtn');
    const resultsContainer = document.getElementById('resultsContainer');
    const previewList = document.getElementById('previewList');
    const rowCountSpan = document.getElementById('rowCount');

    const EXAMPLE_DATA = `coffee, pancakes
coffee, eggs
tea, cereal
coffee, eggs
coffee, pancakes
tea, toast
juice, eggs
coffee, cereal
tea, pancakes
water, cereal
coffee, eggs
tea, toast
coffee, pancakes
juice, cereal
tea, eggs
coffee, toast
tea, pancakes
water, eggs
coffee, cereal
tea, croissant`;

    function escapeHtml(unsafe) {
        return String(unsafe).replace(/[&<>"']/g, m => (
            { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m]
        ));
    }

    function updatePreview() {
        const lines = dataInput.value.split(/\r?\n/).filter(l => l.trim() !== '');
        let html = '';
        for (let i = 0; i < Math.min(lines.length, 8); i++) {
            html += `<div>${escapeHtml(lines[i].trim())}</div>`;
        }
        if (lines.length > 8) html += `<div class="preview-more">… +${lines.length - 8} more</div>`;
        if (lines.length === 0) html = '<div class="preview-empty">— no data —</div>';
        previewList.innerHTML = html;
        rowCountSpan.textContent = `(${lines.length} rows)`;
    }

    function parseData() {
        const lines = dataInput.value.split(/\r?\n/).filter(l => l.trim() !== '');
        const pairs = [];
        for (const line of lines) {
            const parts = line.trim().toLowerCase().split(/[,\s]+/).filter(p => p !== '');
            if (parts.length >= 2) pairs.push([parts[0], parts[1]]);
        }
        return pairs;
    }

    function lnGamma(z) {
        const g = 7;
        const c = [
            0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
        ];
        if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
        z -= 1;
        let x = c[0];
        for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
        const t = z + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function lowerGammaSeries(k, x) {
        let sum = 1 / k, term = 1 / k, n = 1;
        const eps = 1e-12, maxIter = 200;
        while (n < maxIter) {
            term *= x / (k + n);
            sum += term;
            if (Math.abs(term) < eps) break;
            n++;
        }
        return sum * Math.exp(-x + k * Math.log(x) - lnGamma(k));
    }

    function lowerGammaCF(k, x) {
        const eps = 1e-12, maxIter = 200;
        let b = x + 1 - k, c = 1e30, d = 1 / b, h = d;
        for (let i = 1; i <= maxIter; i++) {
            const an = -i * (i - k);
            b += 2;
            d = an * d + b || 1e-30;
            c = b + an / c || 1e-30;
            d = 1 / d;
            const delta = d * c;
            h *= delta;
            if (Math.abs(delta - 1) < eps) break;
        }
        return Math.exp(-x + k * Math.log(x) - lnGamma(k)) * h;
    }

    function chiSquarePValue(chi2, df) {
        if (chi2 <= 0 || df <= 0) return 1.0;
        const k = df / 2, x = chi2 / 2;
        const lowerP = (x < k + 1) ? lowerGammaSeries(k, x) : 1 - lowerGammaCF(k, x);
        return Math.min(1, Math.max(0, 1 - lowerP));
    }

    function prettyCat(cat) {
        const map = {
            coffee: '☕ Coffee', tea: '🍵 Tea', juice: '🧃 Juice', water: '💧 Water',
            pancakes: '🥞 Pancakes', eggs: '🍳 Eggs', cereal: '🥣 Cereal',
            croissant: '🥐 Croissant', toast: '🍞 Toast'
        };
        return map[cat] || cat;
    }

    function renderResults(pairs) {
        resultsContainer.innerHTML = '';

        if (pairs.length === 0) {
            resultsContainer.innerHTML = '<div class="error-msg">⚠️ No valid pairs found. Please provide at least one line with a drink and a food.</div>';
            return;
        }

        const xSet = new Set(), ySet = new Set();
        for (const [x, y] of pairs) { xSet.add(x); ySet.add(y); }
        const xCats = Array.from(xSet).sort();
        const yCats = Array.from(ySet).sort();
        const r = xCats.length, c = yCats.length, n = pairs.length;

        if (r < 2 || c < 2) {
            resultsContainer.innerHTML = `<div class="error-msg">⚠️ Need at least 2 distinct options for each variable.
                Found ${r} drink(s) and ${c} food(s). Add more variety to test independence.</div>`;
            return;
        }

        const matrix = Array.from({ length: r }, () => Array(c).fill(0));
        for (const [x, y] of pairs) {
            matrix[xCats.indexOf(x)][yCats.indexOf(y)] += 1;
        }
        const rowTotals = matrix.map(row => row.reduce((a, b) => a + b, 0));
        const colTotals = Array(c).fill(0);
        for (let j = 0; j < c; j++) colTotals[j] = matrix.reduce((s, row) => s + row[j], 0);
        const grandTotal = n;

        const expected = Array.from({ length: r }, () => Array(c).fill(0));
        for (let i = 0; i < r; i++)
            for (let j = 0; j < c; j++)
                expected[i][j] = (rowTotals[i] * colTotals[j]) / grandTotal;

        const contributions = Array.from({ length: r }, () => Array(c).fill(0));
        let chi2 = 0;
        for (let i = 0; i < r; i++) {
            for (let j = 0; j < c; j++) {
                const e = expected[i][j];
                if (e > 0) {
                    const contrib = Math.pow(matrix[i][j] - e, 2) / e;
                    contributions[i][j] = contrib;
                    chi2 += contrib;
                }
            }
        }

        const df = (r - 1) * (c - 1);
        const pValue = df > 0 ? chiSquarePValue(chi2, df) : 1;

        // ---------- Observed table ----------
        let tableHtml = `<div class="table-container"><table>`;
        tableHtml += `<thead><tr><th>Drink \\ Food</th>`;
        for (const y of yCats) tableHtml += `<th>${prettyCat(y)}</th>`;
        tableHtml += `<th>Row total</th></tr></thead><tbody>`;

        for (let i = 0; i < r; i++) {
            tableHtml += `<tr><td class="row-header-cell">${prettyCat(xCats[i])}</td>`;
            for (let j = 0; j < c; j++) {
                const obs = matrix[i][j];
                const cond = rowTotals[i] > 0 ? (obs / rowTotals[i]).toFixed(3) : '0.000';
                tableHtml += `<td class="obs-cell">${obs}<br><span class="obs-cond">${cond}</span></td>`;
            }
            tableHtml += `<td class="marginal-cell">${rowTotals[i]}</td></tr>`;
        }
        tableHtml += `<tr><td class="row-header-cell">Col total</td>`;
        for (let j = 0; j < c; j++) tableHtml += `<td class="marginal-cell">${colTotals[j]}</td>`;
        tableHtml += `<td class="marginal-cell grand-total">${grandTotal}</td></tr>`;
        tableHtml += `</tbody></table></div>`;

        // ---------- Expected table ----------
        let expHtml = `<div class="table-container" style="margin-top:0.5rem;"><table>`;
        expHtml += `<thead><tr><th>Expected (if independent)</th>`;
        for (const y of yCats) expHtml += `<th>${prettyCat(y)}</th>`;
        expHtml += `</tr></thead><tbody>`;
        for (let i = 0; i < r; i++) {
            expHtml += `<tr><td class="expected-header-cell">${prettyCat(xCats[i])}</td>`;
            for (let j = 0; j < c; j++) expHtml += `<td class="expected-row">${expected[i][j].toFixed(2)}</td>`;
            expHtml += `</tr>`;
        }
        expHtml += `</tbody></table></div>`;

        // ---------- Step-by-step Chi-square breakdown ----------
        let calcHtml = `<div class="calc-breakdown">`;
        calcHtml += `<h3>🧮 Step-by-step Chi-square calculation
            <span class="formula">χ² = Σ (O − E)² / E &nbsp;&nbsp;|&nbsp;&nbsp; one row per cell</span>
        </h3>`;
        calcHtml += `<div style="overflow-x:auto;"><table class="calc-table">`;
        calcHtml += `<thead><tr>
            <th>Drink</th>
            <th>Food</th>
            <th>Observed (O)</th>
            <th>Expected (E)</th>
            <th>O − E</th>
            <th>(O − E)²</th>
            <th>(O − E)² / E</th>
        </tr></thead><tbody>`;

        for (let i = 0; i < r; i++) {
            for (let j = 0; j < c; j++) {
                const O = matrix[i][j];
                const E = expected[i][j];
                const diff = O - E;
                const sq = diff * diff;
                const contrib = contributions[i][j];
                calcHtml += `<tr>
                    <td>${prettyCat(xCats[i])}</td>
                    <td>${prettyCat(yCats[j])}</td>
                    <td>${O}</td>
                    <td>${E.toFixed(2)}</td>
                    <td>${diff.toFixed(2)}</td>
                    <td>${sq.toFixed(4)}</td>
                    <td class="contrib">${contrib.toFixed(6)}</td>
                </tr>`;
            }
        }

        calcHtml += `<tr class="calc-total-row">
            <td colspan="6" style="text-align:right;">Sum → Chi-square statistic</td>
            <td class="chi-total">${chi2.toFixed(6)}</td>
        </tr>`;
        calcHtml += `</tbody></table></div>`;
        calcHtml += `<div class="calc-note">
            Each cell contributes (O − E)² / E. The right-hand column is summed across all cells to produce χ² = ${chi2.toFixed(4)}.
            Larger contributions (highlighted) indicate cells where the observed count deviates most from what independence predicts.
        </div></div>`;

        // ---------- Interpretation ----------
        const alpha = 0.05;
        const significant = pValue < alpha;
        const conclusion = significant
            ? '❌ Reject independence — drink and food choices appear <strong>associated</strong>.'
            : '✅ Fail to reject independence — no significant evidence that drink and food are associated.';

        const interpretHtml = `
            <div class="interpretation">
                <span class="badge">🔍 interpretation</span>
                <strong>Chi-square = ${chi2.toFixed(4)}</strong>, df = ${df}, p = ${pValue.toFixed(6)} (α = 0.05).<br>
                ${conclusion}<br>
                <span class="caveat">⚠️ Association ≠ causation. A significant result means these two variables move together — not that one causes the other.</span>
            </div>`;

        const statsHtml = `
            <div class="stats-panel">
                <div class="chi-box"><span>Chi-square statistic</span><span class="chi-value">${chi2.toFixed(4)}</span></div>
                <div class="chi-box"><span>p-value</span><span class="p-value">${pValue.toFixed(6)}</span></div>
                <div class="stats-meta">df = ${df} &nbsp;|&nbsp; n = ${grandTotal}</div>
            </div>`;

        resultsContainer.innerHTML = tableHtml + expHtml + statsHtml + calcHtml + interpretHtml;
    }

    function compute() {
        updatePreview();
        renderResults(parseData());
    }

    function clearAll() {
        dataInput.value = '';
        updatePreview();
        resultsContainer.innerHTML = '';
    }

    function loadExample() {
        dataInput.value = EXAMPLE_DATA;
        compute();
    }

    computeBtn.addEventListener('click', compute);
    clearBtn.addEventListener('click', clearAll);
    loadExampleBtn.addEventListener('click', loadExample);
    dataInput.addEventListener('input', updatePreview);

    window.addEventListener('DOMContentLoaded', () => {
        dataInput.value = EXAMPLE_DATA;
        compute();
    });
})();