package dag

// DialogueChoice represents a player response option in a story node.
// Each choice has an ID (sent back to server) and display text.
type DialogueChoice struct {
	ID   string // Unique identifier, e.g. "investigate", "cautious"
	Text string // Display text shown to player
}

// TutorialTip provides gameplay hints alongside dialogue.
// Tips appear in a separate overlay panel next to the main dialogue.
type TutorialTip struct {
	Title string // Brief title, e.g. "Route Plotting"
	Text  string // Helpful explanation of game mechanics
}

// DialogueContent contains all presentation data for a story node.
// This data is sent to the client when the node activates.
type DialogueContent struct {
	Speaker       string           // Name displayed above dialogue, e.g. "UNKNOWN SIGNAL"
	Text          string           // Main dialogue text (supports \n newlines)
	Intent        string           // Visual theme: "factory" (blue) or "unit" (pink)
	ContinueLabel string           // Custom label for continue button (empty = "Continue")
	Choices       []DialogueChoice // Player response options (empty = show continue button)
	TutorialTip   *TutorialTip     // Optional gameplay hint (nil = no tip)
}
