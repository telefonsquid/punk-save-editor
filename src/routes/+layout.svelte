<script lang="ts">
	import './layout.css';
	import CrtFilter from '$lib/components/CrtFilter.svelte';

	let { children } = $props();
</script>

<!-- The whole app renders inside this wrapper so the CRT filter falls on every
     page uniformly. The filter itself is defined once by CrtFilter below. -->
<div class="crt-screen">
	{@render children()}
</div>
<CrtFilter />
