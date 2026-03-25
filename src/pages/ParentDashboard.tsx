import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { addDocument, getCollection, updateDocument, subscribeToCollection, removeDocument } from "../lib/firestore";
import { where } from "firebase/firestore";
import QRCode from "react-qr-code";
import { Plus, User, Phone, Mail, AlertCircle, Info, QrCode as QrIcon, Edit, ChevronRight, X, Trash2, Download, ShieldCheck, CheckCircle2, Lock, Home } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

export default function ParentDashboard() {
  const { user, userData } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGuardianModal, setShowGuardianModal] = useState(false);
  const [showGroupQRModal, setShowGroupQRModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [editingChild, setEditingChild] = useState<any>(null);
  const [childToDelete, setChildToDelete] = useState<any>(null);
  const [guardianToDelete, setGuardianToDelete] = useState<any>(null);
  const [newChild, setNewChild] = useState({ firstName: "", surname: "", age: "", gender: "Male", allergies: "", notes: "", photoUrl: "" });
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [newGuardian, setNewGuardian] = useState({ firstName: "", surname: "", phone: "", relationship: "Mother", idNumber: "", photoUrl: "" });
  const [loading, setLoading] = useState(false);

  const RELATIONSHIPS = ["Mother", "Father", "Grandparent", "Aunt", "Uncle", "Sibling", "Nanny", "Other"];
  const GENDERS = ["Male", "Female", "Other"];

  useEffect(() => {
    if (user) {
      const unsubscribeChildren = subscribeToCollection("children", [where("parentId", "==", user.uid)], (data) => {
        setChildren(data);
      });
      const unsubscribeGuardians = subscribeToCollection("guardians", [where("parentId", "==", user.uid)], (data) => {
        setGuardians(data);
      });
      return () => {
        unsubscribeChildren();
        unsubscribeGuardians();
      };
    }
  }, [user]);

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const childId = await addDocument("children", {
        ...newChild,
        age: Number(newChild.age),
        parentId: user.uid,
        qrCode: `child_${Math.random().toString(36).substr(2, 9)}`
      });

      // Check if parent guardian already exists for this account
      const parentFirstName = userData?.firstName || user.displayName?.split(" ")[0] || "Parent";
      const parentSurname = userData?.surname || user.displayName?.split(" ").slice(1).join(" ") || "";
      const parentPhotoUrl = userData?.photoUrl || user.photoURL || "";
      
      const existingParentGuardian = guardians.find(g => 
        g.phone === "Account Holder" && 
        g.parentId === user.uid
      );

      if (existingParentGuardian) {
        // Update existing guardian with new childId
        const updatedChildIds = [...(existingParentGuardian.childIds || []), childId];
        await updateDocument("guardians", existingParentGuardian.id, {
          childIds: updatedChildIds,
          firstName: parentFirstName,
          surname: parentSurname,
          photoUrl: parentPhotoUrl // Ensure photo is synced
        });
      } else {
        // Create new parent guardian
        const qrToken = `guardian_${Math.random().toString(36).substr(2, 12)}`;
        await addDocument("guardians", {
          firstName: parentFirstName,
          surname: parentSurname,
          phone: "Account Holder",
          relationship: "Parent",
          childIds: [childId],
          parentId: user.uid,
          qrToken,
          photoUrl: parentPhotoUrl,
          active: true
        });
      }

      toast.success("Child registered successfully!");
      setShowAddModal(false);
      setNewChild({ firstName: "", surname: "", age: "", gender: "Male", allergies: "", notes: "", photoUrl: "" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to register child");
    } finally {
      setLoading(false);
    }
  };

  const handleEditChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingChild) return;
    setLoading(true);
    try {
      await updateDocument("children", editingChild.id, {
        ...editingChild,
        age: Number(editingChild.age)
      });
      toast.success("Child updated successfully!");
      setShowEditModal(false);
      setEditingChild(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update child");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChild = async () => {
    if (!user || !childToDelete) return;
    setLoading(true);
    try {
      // Update guardians: remove this child from their childIds
      const childGuardians = guardians.filter(g => g.childIds?.includes(childToDelete.id));
      for (const g of childGuardians) {
        const updatedChildIds = g.childIds.filter((id: string) => id !== childToDelete.id);
        if (updatedChildIds.length === 0) {
          await removeDocument("guardians", g.id);
        } else {
          await updateDocument("guardians", g.id, {
            childIds: updatedChildIds
          });
        }
      }
      await removeDocument("children", childToDelete.id);
      toast.success("Child and associated guardian permissions removed");
      setShowDeleteModal(false);
      setChildToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete child");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEditing = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error("Image size must be less than 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (isEditing) {
        setEditingChild({ ...editingChild, photoUrl: base64String });
      } else {
        setNewChild({ ...newChild, photoUrl: base64String });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGuardianImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error("Image size must be less than 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setNewGuardian({ ...newGuardian, photoUrl: base64String });
    };
    reader.readAsDataURL(file);
  };

  const toggleGroupSelection = (id: string) => {
    setSelectedForGroup(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const groupQRValue = selectedForGroup.length > 0 
    ? `group:${selectedForGroup.join(",")}`
    : "";

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedChild) return;
    setLoading(true);
    try {
      // Check if guardian already exists for this account (same name and phone)
      const existingGuardian = guardians.find(g => 
        g.firstName.toLowerCase() === newGuardian.firstName.toLowerCase() && 
        g.surname.toLowerCase() === newGuardian.surname.toLowerCase() && 
        g.phone === newGuardian.phone &&
        g.parentId === user.uid
      );

      if (existingGuardian) {
        if (existingGuardian.childIds?.includes(selectedChild.id)) {
          toast.info("This person is already a guardian for this child");
        } else {
          const updatedChildIds = [...(existingGuardian.childIds || []), selectedChild.id];
          await updateDocument("guardians", existingGuardian.id, {
            childIds: updatedChildIds,
            active: true // Ensure they are active if re-added
          });
          toast.success("Existing guardian linked to this child!");
        }
      } else {
        const qrToken = `guardian_${Math.random().toString(36).substr(2, 12)}`;
        await addDocument("guardians", {
          ...newGuardian,
          childIds: [selectedChild.id],
          parentId: user.uid,
          qrToken,
          active: true
        });
        toast.success("New guardian added successfully!");
      }
      setNewGuardian({ firstName: "", surname: "", phone: "", relationship: "Mother", idNumber: "", photoUrl: "" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to add guardian");
    } finally {
      setLoading(false);
    }
  };

  const toggleGuardianStatus = async (guardian: any) => {
    try {
      await updateDocument("guardians", guardian.id, {
        active: !guardian.active
      });
      toast.success(`Guardian ${!guardian.active ? "activated" : "deactivated"}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const handleDeleteGuardian = async () => {
    if (!guardianToDelete || !selectedChild) return;
    setLoading(true);
    try {
      const updatedChildIds = guardianToDelete.childIds.filter((id: string) => id !== selectedChild.id);
      
      if (updatedChildIds.length === 0) {
        await removeDocument("guardians", guardianToDelete.id);
        toast.success("Guardian removed from system");
      } else {
        await updateDocument("guardians", guardianToDelete.id, {
          childIds: updatedChildIds
        });
        toast.success("Guardian unlinked from this child");
      }
      setGuardianToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove guardian");
    } finally {
      setLoading(false);
    }
  };

  const downloadQR = (id: string, name: string, type: "CHILD" | "GUARDIAN" | "GROUP" = "GUARDIAN") => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const padding = 60;
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2 + 60; // Extra space for text
      
      if (ctx) {
        // Background
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw QR
        ctx.drawImage(img, padding, padding);
        
        // Draw Text
        ctx.fillStyle = "black";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${type}: ${name.toUpperCase()}`, canvas.width / 2, canvas.height - 40);
        
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${name}-${type}-QR.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  if (!user) return <div className="text-center py-12">Please login to view your dashboard.</div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-none">
            <Home className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Parent Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage your children and authorized guardians</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {children.length > 1 && (
            <button
              onClick={() => setShowGroupQRModal(true)}
              className="bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border-2 border-blue-600 dark:border-blue-500 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex items-center justify-center space-x-2 shadow-sm"
            >
              <QrIcon className="h-5 w-5" />
              <span>Group Check-in</span>
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-100"
          >
            <Plus className="h-5 w-5" />
            <span>Add Child</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {children.map((child) => (
          <motion.div
            key={child.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800 space-y-6 hover:shadow-xl transition-all group relative"
          >
            <div className="absolute top-4 right-4 flex items-center space-x-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingChild(child);
                  setShowEditModal(true);
                }}
                className="p-2 bg-white dark:bg-gray-800 shadow-lg rounded-full text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border border-gray-100 dark:border-gray-700"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setChildToDelete(child);
                  setShowDeleteModal(true);
                }}
                className="p-2 bg-white dark:bg-gray-800 shadow-lg rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors border border-gray-100 dark:border-gray-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center overflow-hidden">
                {child.photoUrl ? (
                  <img src={child.photoUrl} alt={`${child.firstName} ${child.surname}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Age</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{child.age} years</p>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{child.firstName} {child.surname}</h3>
              {child.allergies && (
                <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                  <span>{child.allergies}</span>
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl flex flex-col items-center justify-center space-y-4 border border-dashed border-gray-200 dark:border-gray-700 group-hover:border-blue-200 dark:group-hover:border-blue-500/50 transition-colors">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <QRCode id={`qr-child-${child.id}`} value={child.qrCode} size={120} />
              </div>
              <div className="flex flex-col items-center space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Child ID Card</p>
                <button 
                  onClick={() => downloadQR(`qr-child-${child.id}`, `${child.firstName} ${child.surname}`, "CHILD")}
                  className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  <Download className="h-3 w-3" />
                  <span>Download QR</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-800">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {guardians.filter(g => g.childIds?.includes(child.id)).length} Guardians
                </span>
              </div>
              <button 
                onClick={() => {
                  setSelectedChild(child);
                  setShowGuardianModal(true);
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold text-sm flex items-center"
              >
                <span>Manage Guardians</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}

        {children.length === 0 && (
          <div className="col-span-full py-24 text-center space-y-4 bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
            <div className="mx-auto h-16 w-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">No children registered</h3>
              <p className="text-gray-500 dark:text-gray-400">Add your children to get started with secure check-in.</p>
            </div>
          </div>
        )}
      </div>

      {/* Guardian Management Modal */}
      <AnimatePresence>
        {showGuardianModal && selectedChild && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGuardianModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-800"
            >
              <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Guardians for {selectedChild.firstName} {selectedChild.surname}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Authorized people who can pick up this child</p>
                </div>
                <button onClick={() => setShowGuardianModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <form onSubmit={handleAddGuardian} className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl space-y-6 border border-gray-100 dark:border-gray-700">
                  <h4 className="font-bold text-gray-900 dark:text-white">Add New Guardian</h4>
                  
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="h-24 w-24 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden relative group">
                        {newGuardian.photoUrl ? (
                          <img src={newGuardian.photoUrl} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleGuardianImageUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">Upload Photo</p>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">First Name</label>
                        <input
                          required
                          placeholder="e.g. Jane"
                          value={newGuardian.firstName}
                          onChange={e => setNewGuardian({...newGuardian, firstName: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Surname</label>
                        <input
                          required
                          placeholder="e.g. Doe"
                          value={newGuardian.surname}
                          onChange={e => setNewGuardian({...newGuardian, surname: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Phone Number</label>
                        <input
                          required
                          placeholder="Phone"
                          value={newGuardian.phone}
                          onChange={e => setNewGuardian({...newGuardian, phone: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Relationship</label>
                        <select
                          required
                          value={newGuardian.relationship}
                          onChange={e => setNewGuardian({...newGuardian, relationship: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        >
                          {RELATIONSHIPS.map(rel => (
                            <option key={rel} value={rel} className="dark:bg-gray-900">{rel}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ID Number</label>
                        <input
                          required
                          placeholder="ID Number"
                          value={newGuardian.idNumber}
                          onChange={e => setNewGuardian({...newGuardian, idNumber: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-100 dark:shadow-none"
                  >
                    {loading ? "Adding..." : "Add Guardian"}
                  </button>
                </form>

                <div className="space-y-4">
                  <h4 className="font-bold text-gray-900 dark:text-white">Active Guardians</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {guardians.filter(g => g.childIds?.includes(selectedChild.id)).map(guardian => (
                      <div key={guardian.id} className={`p-4 border rounded-2xl space-y-4 bg-white dark:bg-gray-900 shadow-sm transition-all ${!guardian.active ? "opacity-60 grayscale" : "border-gray-100 dark:border-gray-800"}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="h-12 w-12 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700">
                              {guardian.photoUrl ? (
                                <img src={guardian.photoUrl} alt={`${guardian.firstName} ${guardian.surname}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <User className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <p className="font-bold text-gray-900 dark:text-white">{guardian.firstName} {guardian.surname}</p>
                                {!guardian.active && (
                                  <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-bold uppercase">Inactive</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{guardian.relationship} • {guardian.phone}</p>
                              {guardian.idNumber && (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">ID: {guardian.idNumber}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => toggleGuardianStatus(guardian)}
                              className={`p-2 rounded-lg transition-colors ${guardian.active ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                              title={guardian.active ? "Deactivate" : "Activate"}
                            >
                              <ShieldCheck className={`h-5 w-5 ${!guardian.active && "opacity-50"}`} />
                            </button>
                            <button 
                              onClick={() => setGuardianToDelete(guardian)}
                              className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col items-center space-y-2 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl relative border border-gray-100 dark:border-gray-700">
                          {!guardian.active && (
                            <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded-xl z-10">
                              <Lock className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                            </div>
                          )}
                          <div className="bg-white p-2 rounded-lg">
                            <QRCode 
                              id={`qr-${guardian.id}`}
                              value={guardian.qrToken} 
                              size={100} 
                            />
                          </div>
                          <button 
                            disabled={!guardian.active}
                            onClick={() => downloadQR(`qr-${guardian.id}`, `${guardian.firstName} ${guardian.surname}`)}
                            className={`flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider ${guardian.active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600"}`}
                          >
                            <Download className="h-3 w-3" />
                            <span>Download QR</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    {guardians.filter(g => g.childIds?.includes(selectedChild.id)).length === 0 && (
                      <p className="col-span-full text-center py-8 text-gray-400 dark:text-gray-500 text-sm italic">
                        No guardians added yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-8 flex items-center justify-between shrink-0 border-b border-gray-50 dark:border-gray-800">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Register Child</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-6">
                <form onSubmit={handleAddChild} className="space-y-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="h-24 w-24 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden relative group">
                      {newChild.photoUrl ? (
                        <img src={newChild.photoUrl} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">Click to upload photo</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                      <input
                        required
                        type="text"
                        value={newChild.firstName}
                        onChange={(e) => setNewChild({ ...newChild, firstName: e.target.value })}
                        placeholder="e.g. John"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Surname</label>
                      <input
                        required
                        type="text"
                        value={newChild.surname}
                        onChange={(e) => setNewChild({ ...newChild, surname: e.target.value })}
                        placeholder="e.g. Doe"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Age</label>
                      <input
                        required
                        type="number"
                        value={newChild.age}
                        onChange={(e) => setNewChild({ ...newChild, age: e.target.value })}
                        placeholder="Age"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</label>
                      <select
                        required
                        value={newChild.gender}
                        onChange={(e) => setNewChild({ ...newChild, gender: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      >
                        {GENDERS.map(g => (
                          <option key={g} value={g} className="dark:bg-gray-900">{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Allergies (Optional)</label>
                    <div className="relative">
                      <AlertCircle className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={newChild.allergies}
                        onChange={(e) => setNewChild({ ...newChild, allergies: e.target.value })}
                        placeholder="Peanuts, Dairy, etc."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Notes (Optional)</label>
                    <textarea
                      value={newChild.notes}
                      onChange={(e) => setNewChild({ ...newChild, notes: e.target.value })}
                      placeholder="Special instructions..."
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white h-24 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50"
                  >
                    {loading ? "Registering..." : "Add Child"}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showEditModal && editingChild && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-8 flex items-center justify-between shrink-0 border-b border-gray-50 dark:border-gray-800">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Child</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-6">
                <form onSubmit={handleEditChild} className="space-y-6">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="h-24 w-24 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden relative group">
                      {editingChild.photoUrl ? (
                        <img src={editingChild.photoUrl} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, true)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">Click to change photo</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                      <input
                        required
                        type="text"
                        value={editingChild.firstName}
                        onChange={(e) => setEditingChild({ ...editingChild, firstName: e.target.value })}
                        placeholder="e.g. John"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Surname</label>
                      <input
                        required
                        type="text"
                        value={editingChild.surname}
                        onChange={(e) => setEditingChild({ ...editingChild, surname: e.target.value })}
                        placeholder="e.g. Doe"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Age</label>
                      <input
                        required
                        type="number"
                        value={editingChild.age}
                        onChange={(e) => setEditingChild({ ...editingChild, age: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</label>
                      <select
                        required
                        value={editingChild.gender || "Male"}
                        onChange={(e) => setEditingChild({ ...editingChild, gender: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      >
                        {GENDERS.map(g => (
                          <option key={g} value={g} className="dark:bg-gray-900">{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Allergies (Optional)</label>
                    <input
                      type="text"
                      value={editingChild.allergies}
                      onChange={(e) => setEditingChild({ ...editingChild, allergies: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Notes (Optional)</label>
                    <textarea
                      value={editingChild.notes}
                      onChange={(e) => setEditingChild({ ...editingChild, notes: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white h-24 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50"
                  >
                    {loading ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && childToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowDeleteModal(false);
                setChildToDelete(null);
              }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-8 space-y-6 border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" />
                <h2 className="text-2xl font-bold">Delete Child?</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <strong>{childToDelete.firstName} {childToDelete.surname}</strong>? This action will also remove all authorized guardians and cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setChildToDelete(null);
                  }}
                  className="flex-1 py-3 font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteChild}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50"
                >
                  {loading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {guardianToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGuardianToDelete(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-8 space-y-6 border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" />
                <h2 className="text-2xl font-bold">Remove Guardian?</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to remove <strong>{guardianToDelete.firstName} {guardianToDelete.surname}</strong> as a guardian? They will no longer be able to pick up your child.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setGuardianToDelete(null)}
                  className="flex-1 py-3 font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGuardian}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50"
                >
                  {loading ? "Removing..." : "Remove"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupQRModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGroupQRModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-8 flex items-center justify-between shrink-0 border-b border-gray-50 dark:border-gray-800">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Group Check-in</h2>
                <button onClick={() => setShowGroupQRModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-6">
                <div className="space-y-6">
                  <p className="text-gray-500 dark:text-gray-400">Select children to generate a single QR code for group check-in.</p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {children.map(child => (
                      <button
                        key={child.id}
                        onClick={() => toggleGroupSelection(child.id)}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                          selectedForGroup.includes(child.id)
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700">
                            {child.photoUrl ? (
                              <img src={child.photoUrl} alt={`${child.firstName} ${child.surname}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white">{child.firstName} {child.surname}</span>
                        </div>
                        {selectedForGroup.includes(child.id) && (
                          <CheckCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedForGroup.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-8 rounded-3xl flex flex-col items-center space-y-4 border border-dashed border-gray-200 dark:border-gray-700">
                      <div className="bg-white p-4 rounded-xl shadow-sm">
                        <QRCode value={groupQRValue} size={180} />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Group QR Code</p>
                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">{selectedForGroup.length} Children Selected</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
