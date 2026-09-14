import { Users, TrendingUp } from "lucide-react";
import { SAMPLE } from "../../../constants/marketing";
import { Sparkline } from "./Sparkline";

/**
 * The admin "Right now" panel: checked-in count, room occupancy bars and an
 * attendance trend. Mirrors AdminDashboard.tsx's stat-card and room-occupancy
 * markup. Fictional data only, from `SAMPLE`.
 *
 * `roomList` is off in the Hero: that composition overlaps a phone replica
 * over this card's bottom-left corner, and the room list is exactly the
 * content that corner would otherwise cover.
 */
export function AdminRightNow({ showTrend = true, roomList = true }: { showTrend?: boolean; roomList?: boolean }) {
  return (
    <div role="img" aria-label={`Admin dashboard showing ${SAMPLE.checkedInNow} children checked in right now, across ${SAMPLE.rooms.length} rooms`} data-nosnippet className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-1">
            <Users className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Checked in now</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{SAMPLE.checkedInNow}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">This service</span>
          </div>
          {showTrend ? (
            <Sparkline />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white">4 rooms</p>
          )}
        </div>
      </div>

      {roomList && (
        <div className="space-y-2.5">
          {SAMPLE.rooms.map((room) => {
            const pct = Math.min(100, Math.round((room.occupied / room.capacity) * 100));
            return (
              <div key={room.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{room.name}</span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {room.occupied} / {room.capacity}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
