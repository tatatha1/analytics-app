<script lang="ts">
	import type { AIReport } from '$lib/types';

	let {
		report = null as AIReport | null,
		loading = false,
		errorMsg = '',
		onGenerate = () => {}
	}: {
		report: AIReport | null;
		loading: boolean;
		errorMsg?: string;
		onGenerate: () => void;
	} = $props();

	function downloadPDF() {
		if (!report) return;

		const lines = (arr: string[]) => arr.map((s) => `<li>${s}</li>`).join('');

		const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>Analytics Report</title>
<style>
  @page { margin: 2cm; }
  body { font-family: 'Inter', sans-serif; color: #1a1a2e; line-height: 1.6; max-width: 800px; margin: auto; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
  h2 { font-size: 1.125rem; margin-top: 1.5rem; margin-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.25rem; }
  ul { padding-left: 1.25rem; }
  li { margin-bottom: 0.375rem; }
  p { margin: 0.5rem 0; }
  .prognosis { background: #f3f4f6; padding: 1rem; border-radius: 8px; margin-top: 1.5rem; font-style: italic; }
</style></head>
<body>
  <h1>🤖 AI Management Report</h1>
  <p class="meta">Generiert am ${new Date(report.generated_at).toLocaleString('de-DE')}</p>
  <h2>Zusammenfassung</h2>
  <p>${report.summary}</p>
  <h2>Stärken</h2>
  <ul>${lines(report.strengths)}</ul>
  <h2>Schwächen</h2>
  <ul>${lines(report.weaknesses)}</ul>
  <h2>Inhaltsmuster</h2>
  <ul>${lines(report.patterns)}</ul>
  <h2>Handlungsempfehlungen</h2>
  <ul>${lines(report.recommendations)}</ul>
  ${report.prognosis ? `<h2>Wachstumsprognose</h2><div class="prognosis">${report.prognosis}</div>` : ''}
</body></html>`;

		const blob = new Blob([html], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `analytics-report-${new Date().toISOString().slice(0, 10)}.html`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="report-card">
	<div class="report-header">
		<h3 class="report-title">🤖 AI Management Report</h3>
		<div class="report-actions">
			{#if report && !loading}
				<button class="btn-pdf" onclick={downloadPDF}>
					PDF Export
				</button>
			{/if}
			{#if !loading && !report}
				<button class="btn-generate" onclick={onGenerate}>
					Report generieren
				</button>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="report-loading">
			<div class="spinner"></div>
			<span>Analysiere Metriken und generiere Insights...</span>
		</div>
	{:else if errorMsg}
		<div class="report-error">
			<span class="error-icon">⚠️</span>
			<div>
				<p class="error-title">Report-Fehler</p>
				<p class="error-text">{errorMsg}</p>
				<button class="btn-retry" onclick={onGenerate}>Erneut versuchen</button>
			</div>
		</div>
	{:else if report}
		<div class="report-body">
			<div class="report-meta">
				Generiert am {new Date(report.generated_at).toLocaleString('de-DE')}
			</div>

			<div class="report-section">
				<h4>📋 Zusammenfassung</h4>
				<p>{report.summary}</p>
			</div>

			<div class="report-section">
				<h4>✅ Stärken</h4>
				<ul class="report-list positive">
					{#each report.strengths as s}
						<li>{s}</li>
					{/each}
				</ul>
			</div>

			<div class="report-section">
				<h4>⚠️ Schwächen</h4>
				<ul class="report-list negative">
					{#each report.weaknesses as w}
						<li>{w}</li>
					{/each}
				</ul>
			</div>

			<div class="report-section">
				<h4>📊 Inhaltsmuster</h4>
				<ul class="report-list">
					{#each report.patterns as p}
						<li>{p}</li>
					{/each}
				</ul>
			</div>

			<div class="report-section">
				<h4>🎯 Handlungsempfehlungen</h4>
				<ul class="report-list recommendations">
					{#each report.recommendations as r}
						<li>{r}</li>
					{/each}
				</ul>
			</div>

			{#if report.prognosis}
				<div class="report-section prognosis-section">
					<h4>📈 Wachstumsprognose</h4>
					<p class="prognosis-text">{report.prognosis}</p>
				</div>
			{/if}
		</div>
	{:else}
		<div class="report-empty">
			<p>Generiere einen KI-gestützten Report, um Insights zu Content-Performance, Mustern und konkreten Handlungsempfehlungen mit Wachstumsprognose zu erhalten.</p>
		</div>
	{/if}
</div>

<style>
	.report-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		margin: 1rem;
		overflow: hidden;
	}

	.report-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.report-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
	}

	.report-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-generate, .btn-pdf, .btn-retry {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-generate {
		background: var(--primary);
		color: white;
	}

	.btn-pdf {
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.btn-pdf:hover {
		background: var(--hover);
	}

	.btn-retry {
		background: var(--primary);
		color: white;
		margin-top: 0.5rem;
		display: inline-block;
	}

	.btn-generate:hover, .btn-retry:hover {
		opacity: 0.9;
	}

	.report-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.report-error {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1.5rem 1.25rem;
		background: #fef2f2;
	}

	.error-icon {
		font-size: 1.25rem;
	}

	.error-title {
		font-weight: 600;
		color: #991b1b;
		margin: 0 0 0.25rem;
	}

	.error-text {
		font-size: 0.8125rem;
		color: #7f1d1d;
		margin: 0;
		line-height: 1.5;
	}

	.report-body {
		padding: 1.25rem;
	}

	.report-meta {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-bottom: 1rem;
	}

	.report-section {
		margin-bottom: 1.25rem;
	}

	.report-section h4 {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem 0;
	}

	.report-section p {
		font-size: 0.875rem;
		color: var(--text);
		line-height: 1.6;
		margin: 0;
	}

	.report-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.report-list li {
		font-size: 0.875rem;
		color: var(--text);
		line-height: 1.5;
		padding-left: 1.25rem;
		position: relative;
	}

	.report-list li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.5em;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-secondary);
	}

	.report-list.positive li::before { background: #16a34a; }
	.report-list.negative li::before { background: #dc2626; }
	.report-list.recommendations li::before { background: var(--primary); }

	.prognosis-section {
		background: var(--bg);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1.5rem;
	}

	.prognosis-text {
		font-style: italic;
		color: var(--text) !important;
	}

	.report-empty {
		padding: 2rem 1.25rem;
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.report-empty p {
		margin: 0;
		max-width: 400px;
		margin-inline: auto;
		line-height: 1.6;
	}
</style>
