// Sticky Notes page
(function() {
    let notes = [];
    let currentEditId = null;

    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load notes
    async function loadNotes() {
        const list = document.getElementById('sn-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/sticky-notes`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                notes = data.notes || [];
                // Sort by position (ascending)
                notes.sort((a, b) => (a.position || 0) - (b.position || 0));
                renderNotes();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading notes:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render notes
    function renderNotes() {
        const list = document.getElementById('sn-list');
        if (!list) return;
        
        if (!notes || notes.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No sticky notes found</div>';
            return;
        }

        let html = '';
        notes.forEach((note, index) => {
            const statusClass = note.is_active ? 'active' : 'inactive';
            const statusText = note.is_active ? '✅ Active' : '⛔ Inactive';
            
            html += `
                <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #f0f0f0; background: ${note.is_active ? '#fffde7' : '#f5f5f5'};">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 14px;">#${index + 1}</div>
                        <div style="color: #333; font-size: 14px; font-family: 'Comic Sans MS', cursive;">${note.text || '—'}</div>
                        <div style="color: #666; font-size: 11px; margin-top: 2px;">
                            Position: ${note.position || 'auto'} • 
                            Created: ${note.created_at ? new Date(note.created_at).toLocaleDateString() : '—'}
                            ${note.updated_at ? ` • Updated: ${new Date(note.updated_at).toLocaleDateString()}` : ''}
                        </div>
                    </div>
                    <div style="text-align: center; min-width: 80px;">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="snEdit(${note.id})" style="padding: 4px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="snToggleStatus(${note.id})" style="padding: 4px 10px; background: ${note.is_active ? '#ffc107' : '#28a745'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas ${note.is_active ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button onclick="snDelete(${note.id})" style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    // Update stats
    function updateStats() {
        const total = notes.length;
        const active = notes.filter(n => n.is_active).length;
        const inactive = notes.filter(n => !n.is_active).length;
        
        document.getElementById('sn-total').textContent = total;
        document.getElementById('sn-active').textContent = active;
        document.getElementById('sn-inactive').textContent = inactive;
    }

    // Show add modal
    window.snShowAdd = function() {
        currentEditId = null;
        document.getElementById('sn-modal-title').textContent = '📝 Add Sticky Note';
        document.getElementById('sn-edit-id').value = '';
        document.getElementById('sn-text').value = '';
        document.getElementById('sn-position').value = '';
        document.getElementById('sn-active').checked = true;
        document.getElementById('sn-modal-status').style.display = 'none';
        document.getElementById('sn-save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
        document.getElementById('sn-preview').textContent = 'Your note will appear here';
        document.getElementById('sn-char-count').textContent = '0';
        document.getElementById('sn-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('sn-text').focus(), 100);
    };

    // Edit note
    window.snEdit = function(id) {
        const note = notes.find(n => n.id === id);
        if (!note) {
            alert('Note not found');
            return;
        }
        
        currentEditId = id;
        document.getElementById('sn-modal-title').textContent = `✏️ Edit Note #${id}`;
        document.getElementById('sn-edit-id').value = id;
        document.getElementById('sn-text').value = note.text || '';
        document.getElementById('sn-position').value = note.position || '';
        document.getElementById('sn-active').checked = note.is_active !== false;
        document.getElementById('sn-modal-status').style.display = 'none';
        document.getElementById('sn-save-btn').innerHTML = '<i class="fas fa-save"></i> Update';
        document.getElementById('sn-preview').textContent = note.text || 'Your note will appear here';
        document.getElementById('sn-char-count').textContent = (note.text || '').length;
        document.getElementById('sn-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('sn-text').focus(), 100);
    };

    // Update preview
    function updatePreview() {
        const text = document.getElementById('sn-text').value;
        const preview = document.getElementById('sn-preview');
        const charCount = document.getElementById('sn-char-count');
        if (preview) {
            preview.textContent = text || 'Your note will appear here';
        }
        if (charCount) {
            charCount.textContent = text.length;
        }
    }

    // Close modal
    window.snCloseModal = function() {
        document.getElementById('sn-modal').style.display = 'none';
        currentEditId = null;
    };

    // Save note
    window.snSave = async function() {
        const id = document.getElementById('sn-edit-id').value;
        const text = document.getElementById('sn-text').value.trim();
        const position = parseInt(document.getElementById('sn-position').value) || null;
        const isActive = document.getElementById('sn-active').checked;
        
        if (!text) {
            showModalStatus('Note text is required', 'error');
            return;
        }
        
        const data = {
            text: text,
            position: position,
            is_active: isActive
        };
        
        const btn = document.getElementById('sn-save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const url = id ? `${API_BASE}/api/sticky-notes/${id}` : `${API_BASE}/api/sticky-notes`;
            const method = id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ Note saved successfully!', 'success');
                setTimeout(() => {
                    snCloseModal();
                    loadNotes();
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to save'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving note:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Toggle status
    window.snToggleStatus = async function(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        const newStatus = !note.is_active;
        const action = newStatus ? 'activate' : 'deactivate';
        
        if (!confirm(`${action} this note?`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/sticky-notes/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ is_active: newStatus })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast(`✅ Note ${action}d`);
                note.is_active = newStatus;
                renderNotes();
                updateStats();
            } else {
                alert(`Error: ${result.error || 'Failed to update'}`);
            }
        } catch (err) {
            console.error('Error toggling status:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Delete note
    window.snDelete = async function(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        if (!confirm(`Delete this note? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/sticky-notes/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ Note deleted');
                notes = notes.filter(n => n.id !== id);
                renderNotes();
                updateStats();
            } else {
                alert(`Error: ${result.error || 'Failed to delete'}`);
            }
        } catch (err) {
            console.error('Error deleting note:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Refresh
    window.snRefresh = function() {
        loadNotes();
    };

    // Modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('sn-modal-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Toast
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#ffc107';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Character counter
    document.addEventListener('DOMContentLoaded', function() {
        const textarea = document.getElementById('sn-text');
        if (textarea) {
            textarea.addEventListener('input', updatePreview);
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('sn-modal');
        if (modal && e.target === modal) {
            snCloseModal();
        }
    });

    // Init
    window.initStickyNotes = function() {
        console.log('Sticky Notes initialized');
        loadNotes();
    };
})();
