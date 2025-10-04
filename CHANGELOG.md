# Changelog

All noteworthy changes to **Light Speed Duel** will be documented in this file.

## [Unreleased]
### Added
- Contextual landscape UI for touch devices with edge sliders for ship speed and missile controls.
- Keyboard help overlay (`?`) and full keybind coverage for ship and missile actions.
- In-cockpit commands to clear all ship waypoints and delete specific missile waypoints directly from the board.

### Changed
- Replaced the legacy control panels with a picture-frame HUD that tucks ship/missile controls into the border.
- Consolidated missile route management into the HUD with quick cycle buttons and a streamlined options popover.

### Planned
- Pending ideas: time dilation mechanics.

## [0.2.1] - 2024-10-02
### Added
- Multiple missile routes can be made. Missiles can be launched on one of these routes.
- Time delay based cooldown on missile firing. The faster you are the longer the cooldown.

### Changed
- Made a new file structure with packages for game and server code.


## [0.2.0] - 2024-10-02
### Added
- Missile systems with configurable speed, acceleration, agro radius, and lifetimes.
- Missile pursuit AI that respects light-time delays for all observers.
- Missile setup HUD section with sliders, waypoint editing mode, and launch controls.
- Ship acceleration model with proper stopping at waypoints and HP tracking (3-hit kill).

### Changed
- Ships now accelerate/decelerate toward waypoints rather than moving at constant speed.
- HUD shows ship HP and renders missile overlays.

### Fixed
- Percieved missile positions now always use retarded-time snapshots, even for the firing player.

## [0.1.0] - 2024-10-02
### Added
- Initial prototype with ship navigation, retarded-opponent rendering, and WebSocket sync.
