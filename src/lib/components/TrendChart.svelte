<script lang="ts">
	import { onDestroy } from 'svelte';

	let {
		data = [] as Array<{ date: string; value: number }>,
		label = '',
		color = '#3b82f6',
		height = 200,
		dataLabels = [] as string[],
		onPointClick = undefined as ((index: number) => void) | undefined
	}: {
		data: Array<{ date: string; value: number }>;
		label: string;
		color?: string;
		height?: number;
		dataLabels?: string[];
		onPointClick?: (index: number) => void;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: any = null;
	let cursorStyle = $state('default');

	function getThemeColor(variable: string, fallback: string): string {
		if (typeof document === 'undefined') return fallback;
		return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
	}

	async function renderChart() {
		if (!canvas || data.length === 0) return;

		if (chart) {
			chart.destroy();
			chart = null;
		}

		const { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler } = await import('chart.js');

		Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler);

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const textColor = getThemeColor('--text', '#1a1a2e');
		const textSecondary = getThemeColor('--text-secondary', '#6b7280');
		const borderColor = getThemeColor('--border', '#e5e7eb');
		const surfaceColor = getThemeColor('--surface', '#ffffff');

		const dates = data.map((d) => {
			const date = new Date(d.date);
			return date.toLocaleDateString('de-DE', {
				month: 'short',
				day: 'numeric',
				year: data.length > 30 ? '2-digit' : undefined
			});
		});

		chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: dates,
				datasets: [{
					label,
					data: data.map((d) => d.value),
					borderColor: color,
					backgroundColor: color + '1A',
					fill: true,
					tension: 0.3,
					pointRadius: data.length === 1 ? 6 : data.length < 10 ? 4 : 2,
					pointHoverRadius: 8,
					pointBackgroundColor: color,
					pointBorderColor: surfaceColor,
					pointBorderWidth: 2,
					borderWidth: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: { duration: 300 },
				onClick: (_event: any, elements: any[]) => {
					if (elements.length > 0 && onPointClick) {
						onPointClick(elements[0].index);
					}
				},
				onHover: (_event: any, elements: any[]) => {
					cursorStyle = elements.length > 0 && onPointClick ? 'pointer' : 'default';
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: surfaceColor,
						titleColor: textColor,
						bodyColor: textColor,
						borderColor: borderColor,
						borderWidth: 1,
						cornerRadius: 8,
						padding: 10,
						callbacks: {
							afterLabel: (context: any) => {
								const dl = dataLabels?.[context.dataIndex];
								return dl ? '\n' + dl : '';
							}
						}
					}
				},
				scales: {
					x: {
						grid: {
							color: borderColor,
							drawTicks: false
						},
						ticks: {
							color: textSecondary,
							font: { size: 11 },
							maxTicksLimit: 10,
							maxRotation: 0
						}
					},
					y: {
						grid: {
							color: borderColor,
							drawTicks: false
						},
						ticks: {
							color: textSecondary,
							font: { size: 11 },
							maxTicksLimit: 6,
							callback: (value: string | number) => {
								const v = typeof value === 'string' ? parseFloat(value) : value;
								return v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` :
									v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v;
							}
						}
					}
				}
			}
		});
	}

	$effect(() => {
		data;
		if (canvas) {
			renderChart();
		}
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
			chart = null;
		}
	});
</script>

<div class="chart-wrapper" style="height: {height}px; cursor: {cursorStyle};">
	{#if data.length === 0}
		<div class="chart-empty">No data available for chart</div>
	{:else}
		<canvas bind:this={canvas}></canvas>
	{/if}
</div>

<style>
	.chart-wrapper {
		position: relative;
		width: 100%;
	}

	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
</style>
