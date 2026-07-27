<script lang="ts">
	// The category heading over a run of modules, with the count of what's under
	// it. Shared by the vault's card grid and the picker's row list so the two
	// group visibly the same way — the grouping rule itself lives once in
	// $lib/game/module-groups.
	//
	// Margins are the caller's: a grid of cards and a list of rows want different
	// spacing above the same heading.
	let { name, count, class: klass = '' }: { name: string; count: number; class?: string } =
		$props();
</script>

<h3 class="punk-group-title {klass}">
	{name}
	<span class="text-edge">({count})</span>
</h3>
