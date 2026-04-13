import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { subscribeToCollection } from "../lib/firestore";
import { where } from "firebase/firestore";
import { parse, isWithinInterval, subMinutes, format } from "date-fns";

export function useActiveService() {
  const { userData } = useAuth();
  const [activeService, setActiveService] = useState<any>(null);
  const [upcomingServices, setUpcomingServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.churchId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToCollection(
      "services",
      [
        where("churchId", "==", userData.churchId),
        where("status", "in", ["active", "upcoming"])
      ],
      (services) => {
        const active = services.find(s => s.status === "active");
        if (active) {
          setActiveService(active);
          setUpcomingServices([]);
        } else {
          setActiveService(null);
          
          const now = new Date();
          const todayStr = format(now, "yyyy-MM-dd");
          
          const soon = services.filter(s => {
            if (s.status !== "upcoming") return false;
            // If date is present, it must be today
            if (s.date && s.date !== todayStr) return false;
            
            try {
              const start = parse(s.startTime, "HH:mm", now);
              const windowStart = subMinutes(start, 30);
              const end = parse(s.endTime, "HH:mm", now);
              
              return isWithinInterval(now, { start: windowStart, end });
            } catch (e) {
              return false;
            }
          });
          setUpcomingServices(soon);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userData?.churchId]);

  return { activeService, upcomingServices, loading };
}
