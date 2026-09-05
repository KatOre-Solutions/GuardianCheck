import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Building2, 
  Clock, 
  Shield, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Zap,
  Sparkles,
  UserPlus,
  Mail
} from "lucide-react";
import { auth } from "../lib/firebase";
import { addDocument, setDocument, updateDocument } from "../lib/firestore";
import { safeFetch, registerChild, issueGuardianQrToken } from "../lib/api";
import { generatePin, hashPin, obfuscatePin } from "../lib/security";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";

interface SetupWizardProps {
  churchId: string;
  onComplete: () => void;
}

export default function SetupWizard({ churchId, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 2: Rooms
  const [rooms, setRooms] = useState<any[]>([
    { id: "1", name: "Nursery", capacity: "15" },
    { id: "2", name: "Kids Church", capacity: "30" }
  ]);
  const [newRoom, setNewRoom] = useState({ name: "", capacity: "20" });

  // Step 3: Services
  const [services, setServices] = useState<any[]>([
    { id: "1", name: "Sunday Morning", startTime: "09:00", endTime: "10:30" }
  ]);
  const [newService, setNewService] = useState({ name: "", startTime: "11:00", endTime: "12:30" });

  // Step 4: Security
  const [generatedPin, setGeneratedPin] = useState("");

  const handleAddRoom = () => {
    if (!newRoom.name) return;
    setRooms([...rooms, { ...newRoom, id: Math.random().toString(36).slice(2) }]);
    setNewRoom({ name: "", capacity: "20" });
  };

  const handleRemoveRoom = (id: string) => {
    setRooms(rooms.filter(r => r.id !== id));
  };

  const handleAddService = () => {
    if (!newService.name) return;
    setServices([...services, { ...newService, id: Math.random().toString(36).slice(2) }]);
    setNewService({ name: "", startTime: "11:00", endTime: "12:30" });
  };

  const handleRemoveService = (id: string) => {
    setServices(services.filter(s => s.id !== id));
  };

  const handleGeneratePin = async () => {
    const pin = generatePin();
    setGeneratedPin(pin);
  };

  // Step 5: Test Data
  const [createTestData, setCreateTestData] = useState(true);

  // Step 6: Invitations
  const [inviteEmails, setInviteEmails] = useState<string[]>([""]);

  const handleAddInviteEmail = () => {
    setInviteEmails([...inviteEmails, ""]);
  };

  const handleInviteEmailChange = (index: number, value: string) => {
    const newEmails = [...inviteEmails];
    newEmails[index] = value;
    setInviteEmails(newEmails);
  };

  const handleRemoveInviteEmail = (index: number) => {
    setInviteEmails(inviteEmails.filter((_, i) => i !== index));
  };

  const handleFinalize = async () => {
    if (rooms.length === 0) {
      showErrorToast("Please add at least one room");
      return;
    }
    if (services.length === 0) {
      showErrorToast("Please add at least one service");
      return;
    }
    if (!generatedPin) {
      showErrorToast("Please generate an admin override PIN");
      return;
    }

    setLoading(true);
    try {
      // 1. Save Rooms
      const savedRoomIds: string[] = [];
      for (const room of rooms) {
        const roomId = await addDocument("rooms", {
          name: room.name,
          capacity: Number(room.capacity),
          churchId,
          minAge: 0,
          maxAge: 12,
          deleted: false
        });
        if (roomId) savedRoomIds.push(roomId);
      }

      // 2. Save Services
      const today = new Date().toISOString().split('T')[0];
      const eventId = await addDocument("events", {
        churchId,
        name: "Launch Event",
        date: today,
        deleted: false
      });

      if (eventId) {
        for (const service of services) {
          await addDocument("services", {
            churchId,
            eventId,
            name: service.name,
            startTime: service.startTime,
            endTime: service.endTime,
            status: "upcoming",
            date: today,
            deleted: false
          });
        }
      }

      // 3. Save Security
      const hash = await hashPin(generatedPin);
      const obfuscated = obfuscatePin(generatedPin);
      await setDocument("church_security", churchId, {
        adminOverridePinHash: hash,
        adminOverridePin: obfuscated,
        pinLastUpdatedAt: new Date().toISOString()
      });

      // 4. Create Test Data if requested
      if (createTestData && savedRoomIds.length > 0) {
        // Create a test child
        const childId = await addDocument("children", {
          firstName: "Test",
          lastName: "Child",
          age: 5,
          gender: "Male",
          churchId,
          parentId: "demo-parent",
          parentName: "Demo Parent",
          qrCode: `demo_child_${Math.random().toString(36).slice(2)}`,
          deleted: false
        });

        // Create a test guardian. The QR token is minted by the server
        // afterwards -- firestore.rules refuses a client-supplied `qrToken`,
        // and this used to set one from Math.random(). See guardian-tokens.ts.
        if (childId) {
          const guardianId = await addDocument("guardians", {
            firstName: "Demo",
            lastName: "Parent",
            phone: "0000000000",
            relationship: "Father",
            childIds: [childId],
            parentId: "demo-parent",
            churchId,
            active: true,
            deleted: false
          });

          if (guardianId) {
            try {
              const token = await auth.currentUser?.getIdToken();
              if (token) await issueGuardianQrToken(token, guardianId);
            } catch (err) {
              // Demo data only -- a guardian without a QR is a cosmetic gap
              // in a sample record, not a reason to fail church setup.
              console.error("Failed to issue demo guardian QR token:", err);
            }
          }
        }
      }

      // 5. Send Invitations
      const validEmails = inviteEmails.filter(e => e.trim() !== "" && e.includes("@"));
      if (validEmails.length > 0) {
        const idToken = await auth.currentUser?.getIdToken();
        for (const email of validEmails) {
          try {
            await safeFetch("/api/invite-user", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({
                email: email.toLowerCase().trim(),
                firstName: "Team",
                lastName: "Member",
                role: "volunteer"
              })
            });
          } catch (inviteErr) {
            console.error(`Failed to invite ${email}:`, inviteErr);
          }
        }
      }

      // 6. Update Church Setup Status
      await updateDocument("churches", churchId, {
        setupCompleted: true,
        updatedAt: new Date().toISOString()
      });

      showSuccessToast("Setup completed! Welcome to your new dashboard.");
      onComplete();
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to complete setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: 1, title: "Welcome", icon: Sparkles },
    { id: 2, title: "Rooms", icon: Building2 },
    { id: 3, title: "Services", icon: Clock },
    { id: 4, title: "Security", icon: Shield },
    { id: 5, title: "Test Data", icon: Zap },
    { id: 6, title: "Team", icon: UserPlus },
    { id: 7, title: "Finish", icon: CheckCircle2 }
  ];

  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800"
      >
        {/* Header */}
        <div className="bg-primary p-8 text-white">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Quick Setup Wizard</h2>
                <p className="text-white/80 text-sm">Let's get your church ready in 5 minutes.</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold opacity-20">STEP {step}/{totalSteps}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(step / totalSteps) * 100}%` }}
              className="h-full bg-white"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8 min-h-[400px] flex flex-col">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="h-20 w-20 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center mx-auto">
                    <Sparkles className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to GuardianCheck!</h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    We're excited to help you secure your children's ministry. This wizard will help you set up the basics so you can start checking in children today.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <p className="font-bold text-gray-900 dark:text-white">Rooms & Services</p>
                    <p className="text-xs text-gray-500">Define where and when kids meet.</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <p className="font-bold text-gray-900 dark:text-white">Test Data</p>
                    <p className="text-xs text-gray-500">Practice check-ins immediately.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Configure Rooms</h3>
                  <span className="text-sm text-gray-500">{rooms.length} Rooms Added</span>
                </div>

                <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
                  {rooms.map((room) => (
                    <div key={room.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{room.name}</p>
                        <p className="text-xs text-gray-500">Capacity: {room.capacity} children</p>
                      </div>
                      <button onClick={() => handleRemoveRoom(room.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Room Name (e.g. Toddlers)"
                    value={newRoom.name}
                    onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                    className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                  />
                  <input 
                    type="number" 
                    placeholder="Cap"
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
                    className="w-20 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                  />
                  <button 
                    onClick={handleAddRoom}
                    className="p-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Configure Services</h3>
                  <span className="text-sm text-gray-500">{services.length} Services Added</span>
                </div>

                <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{service.name}</p>
                        <p className="text-xs text-gray-500">{service.startTime} - {service.endTime}</p>
                      </div>
                      <button onClick={() => handleRemoveService(service.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input 
                    type="text" 
                    placeholder="Service Name"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                  />
                  <div className="flex gap-2">
                    <input 
                      type="time" 
                      value={newService.startTime}
                      onChange={(e) => setNewService({ ...newService, startTime: e.target.value })}
                      className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                    />
                    <button 
                      onClick={handleAddService}
                      className="p-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="h-20 w-20 bg-amber-50 dark:bg-amber-900/20 rounded-3xl flex items-center justify-center mx-auto">
                    <Shield className="h-10 w-10 text-amber-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Security Setup</h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    Generate an Admin Override PIN. This PIN allows volunteers to bypass restrictions (like checking out a child without a QR code) in emergencies.
                  </p>
                </div>

                <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
                  {generatedPin ? (
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Your Secure PIN</p>
                      <p className="text-5xl font-mono font-bold text-primary tracking-tighter">{generatedPin}</p>
                      <p className="text-xs text-amber-600 font-medium">Write this down! It won't be shown again in plain text.</p>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGeneratePin}
                      className="px-8 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none"
                    >
                      Generate Override PIN
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div 
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="h-20 w-20 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center mx-auto">
                    <Zap className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Practice Makes Perfect</h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    Would you like us to create a test family? This allows you to practice check-ins immediately without needing real data.
                  </p>
                </div>

                <div 
                  onClick={() => setCreateTestData(!createTestData)}
                  className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${createTestData ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800'}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${createTestData ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">Create Test Data</p>
                      <p className="text-xs text-gray-500">Includes 1 test child and 1 test guardian.</p>
                    </div>
                  </div>
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${createTestData ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                    {createTestData && <div className="h-2 w-2 bg-white rounded-full" />}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div 
                key="step6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Invite Your Team</h3>
                  <span className="text-sm text-gray-500">{inviteEmails.filter(e => e).length} Invited</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enter the email addresses of your volunteers or co-admins. They'll receive an invitation to join your church.
                </p>

                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                  {inviteEmails.map((email, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input 
                          type="email" 
                          placeholder="volunteer@church.com"
                          value={email}
                          onChange={(e) => handleInviteEmailChange(index, e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                        />
                      </div>
                      {inviteEmails.length > 1 && (
                        <button 
                          onClick={() => handleRemoveInviteEmail(index)}
                          className="p-3 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleAddInviteEmail}
                  className="flex items-center space-x-2 text-primary dark:text-primary/80 font-bold text-sm hover:opacity-80 transition-opacity"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Another Email</span>
                </button>
              </motion.div>
            )}

            {step === 7 && (
              <motion.div 
                key="step7"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 text-center"
              >
                <div className="h-24 w-24 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white">You're All Set!</h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  We've configured your initial rooms, services, and security settings. You can now start adding families and checking in children.
                </p>
                
                <div className="bg-primary/10 dark:bg-primary/20 p-6 rounded-2xl border border-primary/20 dark:border-primary/30 text-left space-y-3">
                  <p className="text-sm font-bold text-primary dark:text-primary/80">Next Steps Recommendation:</p>
                  <ul className="text-sm text-primary/80 dark:text-primary/70 space-y-2">
                    <li className="flex items-center space-x-2">
                      <div className="h-1.5 w-1.5 bg-primary/40 rounded-full" />
                      <span>Invite your first volunteer</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <div className="h-1.5 w-1.5 bg-primary/40 rounded-full" />
                      <span>Register a test family</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <div className="h-1.5 w-1.5 bg-primary/40 rounded-full" />
                      <span>Try a test check-in</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="mt-auto pt-8 flex items-center justify-between">
            <button 
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || loading}
              className="flex items-center space-x-2 text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold transition-colors disabled:opacity-0"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>

            {step < totalSteps ? (
              <button 
                onClick={() => setStep(step + 1)}
                className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            ) : (
              <button 
                onClick={handleFinalize}
                disabled={loading}
                className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Finalizing...</span>
                  </>
                ) : (
                  <>
                    <span>Go to Dashboard</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
