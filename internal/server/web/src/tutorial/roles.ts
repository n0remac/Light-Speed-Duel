export type RoleId =
  | "canvas"
  | "shipSet"
  | "shipSelect"
  | "shipDelete"
  | "shipClear"
  | "shipSpeedSlider"
  | "missileSet"
  | "missileSelect"
  | "missileDelete"
  | "missileSpeedSlider"
  | "missileAgroSlider"
  | "missileAddRoute"
  | "missileLaunch"
  | "routePrev"
  | "routeNext"
  | "helpToggle"
  | "tutorialStart"
  | "spawnBot";

export type RoleResolver = () => HTMLElement | null;

export type RolesMap = Record<RoleId, RoleResolver>;

export function createRoles(): RolesMap {
  return {
    canvas: () => document.getElementById("cv"),
    shipSet: () => document.getElementById("ship-set"),
    shipSelect: () => document.getElementById("ship-select"),
    shipDelete: () => document.getElementById("ship-delete"),
    shipClear: () => document.getElementById("ship-clear"),
    shipSpeedSlider: () => document.getElementById("ship-speed-slider"),
    missileSet: () => document.getElementById("missile-set"),
    missileSelect: () => document.getElementById("missile-select"),
    missileDelete: () => document.getElementById("missile-delete"),
    missileSpeedSlider: () => document.getElementById("missile-speed-slider"),
    missileAgroSlider: () => document.getElementById("missile-agro-slider"),
    missileAddRoute: () => document.getElementById("missile-add-route"),
    missileLaunch: () => document.getElementById("missile-launch"),
    routePrev: () => document.getElementById("route-prev"),
    routeNext: () => document.getElementById("route-next"),
    helpToggle: () => document.getElementById("help-toggle"),
    tutorialStart: () => document.getElementById("tutorial-start"),
    spawnBot: () => document.getElementById("spawn-bot"),
  };
}

export function getRoleElement(roles: RolesMap, role: RoleId | null | undefined): HTMLElement | null {
  if (!role) return null;
  const resolver = roles[role];
  return resolver ? resolver() : null;
}
