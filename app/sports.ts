import { Sneaker, SoccerBall, TennisBall, Mountains, Barbell, DotsThreeCircle, type Icon } from "@phosphor-icons/react";
import type { Sport, SessionSport, Capacity } from "../engine/types";

export const SPORT_ORDER: Sport[] = ["running", "football", "tennis", "bouldering", "gym"];
export const SOURCE_ORDER: SessionSport[] = [...SPORT_ORDER, "other"];

export const SPORT_META: Record<SessionSport, { name: string; color: string; Icon: Icon }> = {
  running:    { name: "Running",    color: "var(--sport-run)",      Icon: Sneaker },
  football:   { name: "Football",   color: "var(--sport-football)", Icon: SoccerBall },
  tennis:     { name: "Tennis",     color: "var(--sport-tennis)",   Icon: TennisBall },
  bouldering: { name: "Bouldering", color: "var(--sport-boulder)",  Icon: Mountains },
  gym:        { name: "Gym",        color: "var(--sport-gym)",      Icon: Barbell },
  other:      { name: "Other",      color: "var(--sport-other)",    Icon: DotsThreeCircle },
};

export const CAPACITY_ORDER: Capacity[] = ["engine", "speed", "legs", "pull"];
export const CAPACITY_NAME: Record<Capacity, string> = { engine: "Engine", speed: "Speed", legs: "Legs", pull: "Pull & grip" };
