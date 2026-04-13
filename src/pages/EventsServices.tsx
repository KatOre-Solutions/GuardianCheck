import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { 
  getEvents, 
  getServices, 
  addDocument, 
  updateDocument, 
  removeDocument, 
  activateService,
  ensureSundayEvents,
  subscribeToCollection,
  subscribeToDocument
} from "../lib/firestore";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  X, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  Loader2,
  Play
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, parseISO, isAfter, startOfDay } from "date-fns";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { where } from "firebase/firestore";

export default function EventsServices() {
  const { userData } = useAuth();
  const [churchData, setChurchData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  
  const [showEventModal, setShowEventModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editingService, setEditingService] = useState<any>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'event' | 'service', id: string } | null>(null);

  const [eventForm, setEventForm] = useState({ name: "", date: format(new Date(), "yyyy-MM-dd") });
  const [serviceForm, setServiceForm] = useState({ name: "", startTime: "09:00", endTime: "10:30" });

  useEffect(() => {
    if (!userData?.churchId) return;

    // Ensure Sunday events exist
    ensureSundayEvents(userData.churchId);

    const unsubChurch = subscribeToDocument("churches", userData.churchId, setChurchData);

    const unsubEvents = subscribeToCollection("events", [
      where("churchId", "==", userData.churchId)
    ], (data) => {
      const sorted = data.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
      setEvents(sorted);
      setLoading(false);
    });

    const unsubServices = subscribeToCollection("services", [
      where("churchId", "==", userData.churchId)
    ], (data) => {
      setServices(data);
    });

    return () => {
      unsubEvents();
      unsubServices();
      unsubChurch();
    };
  }, [userData?.churchId]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => 
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId) return;

    try {
      if (editingEvent) {
        await updateDocument("events", editingEvent.id, eventForm);
        showSuccessToast("Event updated");
      } else {
        await addDocument("events", {
          ...eventForm,
          churchId: userData.churchId
        });
        showSuccessToast("Event created");
      }
      setShowEventModal(false);
      setEditingEvent(null);
      setEventForm({ name: "", date: format(new Date(), "yyyy-MM-dd") });
    } catch (error) {
      showErrorToast("Failed to save event");
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId || !selectedEventId) return;

    try {
      if (editingService) {
        await updateDocument("services", editingService.id, serviceForm);
        showSuccessToast("Service updated");
      } else {
        const event = events.find(e => e.id === selectedEventId);
        await addDocument("services", {
          ...serviceForm,
          eventId: selectedEventId,
          eventName: event?.name || "Event",
          churchId: userData.churchId,
          status: "upcoming",
          date: event?.date || ""
        });
        showSuccessToast("Service added");
      }
      setShowServiceModal(false);
      setEditingService(null);
      setServiceForm({ name: "", startTime: "09:00", endTime: "10:30" });
    } catch (error) {
      showErrorToast("Failed to save service");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await removeDocument("events", id);
      showSuccessToast("Event deleted");
      setShowDeleteConfirm(null);
    } catch (error) {
      showErrorToast("Failed to delete event");
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      await removeDocument("services", id);
      showSuccessToast("Service deleted");
      setShowDeleteConfirm(null);
    } catch (error) {
      showErrorToast("Failed to delete service");
    }
  };

  const handleActivateService = async (churchId: string, serviceId: string) => {
    try {
      await activateService(churchId, serviceId);
      showSuccessToast("Service activated");
    } catch (error) {
      showErrorToast("Failed to activate service");
    }
  };

  const handleCloseService = async (serviceId: string) => {
    try {
      await updateDocument("services", serviceId, { status: "closed" });
      showSuccessToast("Service closed");
    } catch (error) {
      showErrorToast("Failed to close service");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Events & Services</h1>
            {churchData?.name && (
              <span className="bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 px-3 py-1 rounded-full text-sm font-bold border border-primary/20 dark:border-primary/30">
                {churchData.name}
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">Manage your church services and operational context</p>
        </div>
        <button
          onClick={() => {
            setEditingEvent(null);
            setEventForm({ name: "", date: format(new Date(), "yyyy-MM-dd") });
            setShowEventModal(true);
          }}
          className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none"
        >
          <Plus className="h-5 w-5" />
          <span>Add Event</span>
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {events.filter(e => !e.deleted).map((event) => {
          const eventServices = services.filter(s => !s.deleted && s.eventId === event.id);
          const isExpanded = expandedEvents.includes(event.id);
          const eventDate = parseISO(event.date);
          const isPast = isAfter(startOfDay(new Date()), startOfDay(eventDate));

          return (
            <motion.div
              key={event.id}
              layout
              className={`bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all ${isPast ? 'opacity-75' : ''}`}
            >
              <div 
                className="p-6 flex items-center justify-between cursor-pointer"
                onClick={() => toggleEvent(event.id)}
              >
                <div className="flex items-center space-x-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${isPast ? 'bg-gray-100 dark:bg-gray-800' : 'bg-primary/10 dark:bg-primary/20'}`}>
                    <Calendar className={`h-6 w-6 ${isPast ? 'text-gray-400' : 'text-primary dark:text-primary/80'}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{event.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{format(eventDate, "EEEE, MMMM do, yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Services</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{eventServices.length}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEvent(event);
                        setEventForm({ name: event.name, date: event.date });
                        setShowEventModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-primary dark:hover:text-primary/70 transition-colors"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm({ type: 'event', id: event.id });
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-6 w-6 text-gray-400" /> : <ChevronDown className="h-6 w-6 text-gray-400" />}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-50 dark:border-gray-800"
                  >
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Services for this event</h4>
                        <button
                          onClick={() => {
                            setSelectedEventId(event.id);
                            setEditingService(null);
                            setServiceForm({ name: "", startTime: "09:00", endTime: "10:30" });
                            setShowServiceModal(true);
                          }}
                          className="text-primary dark:text-primary/80 text-sm font-bold flex items-center space-x-1 hover:underline"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add Service</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {eventServices.filter(s => !s.deleted).map((service) => (
                          <div 
                            key={service.id}
                            className={`p-4 rounded-2xl border-2 transition-all ${
                              service.status === "active" 
                                ? "border-primary bg-primary/10 dark:bg-primary/20" 
                                : "border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50"
                            }`}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h5 className="font-bold text-gray-900 dark:text-white">{service.name}</h5>
                                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{service.startTime} - {service.endTime}</span>
                                </div>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                service.status === "active" ? "bg-primary text-white" :
                                service.status === "closed" ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400" :
                                "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                              }`}>
                                {service.status}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => {
                                    setEditingService(service);
                                    setServiceForm({ name: service.name, startTime: service.startTime, endTime: service.endTime });
                                    setSelectedEventId(event.id);
                                    setShowServiceModal(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm({ type: 'service', id: service.id })}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              
                              {service.status === "active" ? (
                                <button
                                  onClick={() => handleCloseService(service.id)}
                                  className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-all"
                                >
                                  Close Service
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleActivateService(userData!.churchId, service.id)}
                                  className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 transition-all flex items-center space-x-1"
                                >
                                  <Play className="h-3 w-3 fill-current" />
                                  <span>Activate</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {eventServices.length === 0 && (
                          <div className="col-span-full py-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <p className="text-sm text-gray-500 dark:text-gray-400">No services added to this event yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center py-24 bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800">
            <Calendar className="h-16 w-16 text-gray-200 dark:text-gray-800 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">No events found</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Create your first event to get started.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10"
            >
              <div className="flex items-center space-x-4 text-red-600 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold">Confirm Delete</h2>
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Are you sure you want to delete this {showDeleteConfirm.type}? 
                {showDeleteConfirm.type === 'event' && " This will not delete associated services but they will be orphaned."}
                This action cannot be undone.
              </p>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (showDeleteConfirm.type === 'event') {
                      handleDeleteEvent(showDeleteConfirm.id);
                    } else {
                      handleDeleteService(showDeleteConfirm.id);
                    }
                  }}
                  className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-100 dark:shadow-none"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Modal */}
      <AnimatePresence>
        {showEventModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingEvent ? "Edit Event" : "Create New Event"}
                </h2>
                <button onClick={() => setShowEventModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleSaveEvent} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Event Name</label>
                  <input
                    required
                    type="text"
                    value={eventForm.name}
                    onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="e.g. Sunday Morning Service"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date</label>
                  <input
                    required
                    type="date"
                    value={eventForm.date}
                    onChange={e => setEventForm({ ...eventForm, date: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none"
                  >
                    {editingEvent ? "Update Event" : "Create Event"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Service Modal */}
      <AnimatePresence>
        {showServiceModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingService ? "Edit Service" : "Add Service"}
                </h2>
                <button onClick={() => setShowServiceModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleSaveService} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Service Name</label>
                  <input
                    required
                    type="text"
                    value={serviceForm.name}
                    onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="e.g. 09:00 Service"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Start Time</label>
                    <input
                      required
                      type="time"
                      value={serviceForm.startTime}
                      onChange={e => setServiceForm({ ...serviceForm, startTime: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">End Time</label>
                    <input
                      required
                      type="time"
                      value={serviceForm.endTime}
                      onChange={e => setServiceForm({ ...serviceForm, endTime: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowServiceModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none"
                  >
                    {editingService ? "Update Service" : "Add Service"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
