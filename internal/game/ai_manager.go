package game

func (r *Room) updateAI() {
	if len(r.Bots) == 0 {
		return
	}
	now := r.Now
	for id, agent := range r.Bots {
		if agent == nil || agent.Behavior == nil {
			continue
		}
		player := r.Players[id]
		if player == nil {
			continue
		}
		if player.Ship == 0 || !r.World.Exists(player.Ship) {
			continue
		}
		if r.World.DestroyedData(player.Ship) != nil {
			continue
		}
		if !agent.ready(now) {
			continue
		}
		ctx := buildAIContext(r, player)
		cmds := agent.Behavior.Plan(ctx)
		agent.planned(now)
		for _, cmd := range cmds {
			if cmd == nil {
				continue
			}
			cmd.apply(r, player)
		}
	}
}
