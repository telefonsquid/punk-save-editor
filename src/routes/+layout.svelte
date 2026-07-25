<script lang="ts">
	import './layout.css';
	import CrtFilter from '$lib/components/CrtFilter.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- The whole app renders inside this wrapper so the CRT filter falls on every
     page uniformly. The filter itself is defined once by CrtFilter below. -->
<div class="crt-screen">
	{@render children()}
</div>
<CrtFilter />
