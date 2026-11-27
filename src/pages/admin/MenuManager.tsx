import React, { useState } from 'react';
import { useMenu } from '../../context/MenuContext';
import { MenuItem, MenuCategory } from '../../data/menu';
import { Edit2, Trash2, Plus, X, Eye, EyeOff, FolderOpen } from 'lucide-react';

import { formatCurrency } from '../../utils/currency';

export default function MenuManager() {
  const { 
    categories, 
    addMenuItem, 
    updateMenuItem, 
    deleteMenuItem, 
    toggleItemAvailability, 
    addCategory, 
    updateCategory, 
    deleteCategory,
    invalidateCache,
    refreshMenu
  } = useMenu();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  
  const [editingItem, setEditingItem] = useState<{ categoryId: string; item: MenuItem } | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    categoryId: string;
    calories: number;
    maxPerOrder: number;
  }>({
    id: '',
    name: '',
    description: '',
    price: 0,
    image: '',
    categoryId: '',
    calories: 0,
    maxPerOrder: 20
  });

  const [catName, setCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  const getCategoryDisplayName = (name: string, id?: string): string => {
    if (id === 'sides' || name.toLowerCase() === 'sides' || name.toLowerCase() === 'slides') {
      return 'Slides';
    }
    return name;
  };

  const allItems = categories.flatMap(cat => 
    cat.items.map(item => ({ ...item, categoryId: cat.id, categoryName: cat.name }))
  );

  const filteredItems = allItems.filter(item => 
    selectedCategoryFilter === 'all' || item.categoryId === selectedCategoryFilter
  );

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      description: '',
      price: 0,
      image: '',
      categoryId: categories[0]?.id || '',
      calories: 0,
      maxPerOrder: 20
    });
    setIsModalOpen(true);
  };

  const openEditModal = (categoryId: string, item: MenuItem) => {
    setEditingItem({ categoryId, item });
    setFormData({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      categoryId: categoryId,
      calories: item.calories,
      maxPerOrder: item.maxPerOrder ?? 20
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const itemPayload: MenuItem = {
      id: formData.id,
      name: formData.name,
      description: formData.description,
      price: Number(formData.price),
      image: formData.image,
      calories: Number(formData.calories),
      available: editingItem ? editingItem.item.available : true,
      maxPerOrder: formData.maxPerOrder
    };

    if (editingItem) {
      if (editingItem.categoryId !== formData.categoryId) {
        // Category changed, delete from old, add to new
        await deleteMenuItem(editingItem.categoryId, editingItem.item.id);
        await addMenuItem(formData.categoryId, itemPayload);
      } else {
        await updateMenuItem(formData.categoryId, itemPayload.id, itemPayload);
      }
    } else {
      await addMenuItem(formData.categoryId, itemPayload);
    }
    
    // Invalidate cache and trigger MenuContext refresh
    invalidateCache();
    await refreshMenu();
    closeModal();
  };

  const openCatModal = () => setIsCatModalOpen(true);
  const closeCatModal = () => {
    setIsCatModalOpen(false);
    setEditingCatId(null);
    setCatName('');
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCatId) {
      await updateCategory(editingCatId, catName);
    } else {
      await addCategory({ id: Math.random().toString(36).substr(2, 9), name: catName, items: [] });
    }
    invalidateCache();
    await refreshMenu();
    closeCatModal();
  };

  const handleDeleteItem = async (categoryId: string, itemId: string) => {
    await deleteMenuItem(categoryId, itemId);
    invalidateCache();
    await refreshMenu();
  };

  const handleToggleItemAvailability = async (categoryId: string, itemId: string) => {
    await toggleItemAvailability(categoryId, itemId);
    invalidateCache();
    await refreshMenu();
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await deleteCategory(categoryId);
    invalidateCache();
    await refreshMenu();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary tracking-tight">
            Menu Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage dishes, pricing, availability, and categories.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            className="border border-border text-text-primary px-3 py-2 rounded-sm text-xs font-medium bg-white outline-none focus:border-text-primary cursor-pointer capitalize"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {getCategoryDisplayName(cat.name, cat.id)}
              </option>
            ))}
          </select>

          <button 
            type="button"
            onClick={openCatModal}
            className="flex items-center gap-1.5 bg-white border border-border text-text-primary px-3.5 py-2 rounded-sm text-xs font-medium hover:border-text-primary transition-colors whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Categories</span>
          </button>
          <button 
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-text-primary text-bg-primary px-4 py-2 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-bg-primary border-b border-border text-xs font-medium text-text-muted">
              <tr>
                <th className="px-5 py-3.5 font-medium">Item</th>
                <th className="px-5 py-3.5 font-medium">Category</th>
                <th className="px-5 py-3.5 font-medium text-right">Price</th>
                <th className="px-5 py-3.5 font-medium">Availability</th>
                <th className="px-5 py-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredItems.map(item => (
                <tr key={item.id} className={`hover:bg-bg-primary/60 transition-colors ${item.available === false ? 'opacity-55' : ''}`}>
                  <td className="px-5 py-3.5 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-sm overflow-hidden bg-bg-secondary border border-border shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="font-medium text-text-primary">{item.name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-text-secondary capitalize">
                    {getCategoryDisplayName(item.categoryName, item.categoryId)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-xs font-mono tabular-nums font-medium text-text-primary">
                    {formatCurrency(item.price)}
                  </td>
                  <td className="px-5 py-3.5">
                    <button 
                      type="button"
                      onClick={() => handleToggleItemAvailability(item.categoryId, item.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs font-medium transition-colors ${
                        item.available !== false 
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-50' 
                          : 'border-border bg-bg-secondary text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {item.available !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{item.available !== false ? 'Available' : 'Hidden'}</span>
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditModal(item.categoryId, item)}
                      className="p-2 text-text-secondary hover:text-text-primary transition-colors inline-block"
                      aria-label={`Edit ${item.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.categoryId, item.id)}
                      className="p-2 text-text-muted hover:text-red-600 transition-colors inline-block ml-1"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {allItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-secondary">
                    No menu items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h2 className="text-xl font-serif font-medium text-text-primary">
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </h2>
              <button type="button" onClick={closeModal} className="p-1 text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3.5 py-2 border border-border rounded-sm text-sm outline-none focus:border-text-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
                <textarea 
                  required
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3.5 py-2 border border-border rounded-sm text-sm outline-none focus:border-text-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Price (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                    className="w-full px-3.5 py-2 border border-border rounded-sm text-sm font-mono tabular-nums outline-none focus:border-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Category</label>
                  <select
                    required
                    value={formData.categoryId}
                    onChange={e => setFormData({...formData, categoryId: e.target.value})}
                    className="w-full px-3.5 py-2 border border-border rounded-sm text-sm outline-none focus:border-text-primary bg-white capitalize"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{getCategoryDisplayName(cat.name, cat.id)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Calories</label>
                  <input 
                    type="number" 
                    min="0"
                    required
                    value={formData.calories}
                    onChange={e => setFormData({...formData, calories: Number(e.target.value)})}
                    className="w-full px-3.5 py-2 border border-border rounded-sm text-sm font-mono tabular-nums outline-none focus:border-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Max Per Order</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="Default is 20"
                    value={formData.maxPerOrder === undefined ? '' : formData.maxPerOrder}
                    onChange={e => setFormData({...formData, maxPerOrder: e.target.value === '' ? undefined : Number(e.target.value)})}
                    className="w-full px-3.5 py-2 border border-border rounded-sm text-sm font-mono tabular-nums outline-none focus:border-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Image URL</label>
                <input 
                  type="url" 
                  required
                  value={formData.image}
                  onChange={e => setFormData({...formData, image: e.target.value})}
                  className="w-full px-3.5 py-2 border border-border rounded-sm text-sm font-mono outline-none focus:border-text-primary"
                  placeholder="https://..."
                />
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-text-primary text-bg-primary px-6 py-2 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors"
                >
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCatModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h2 className="text-xl font-serif font-medium text-text-primary">Manage Categories</h2>
              <button type="button" onClick={closeCatModal} className="p-1 text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleSaveCat} className="flex gap-2.5 mb-6">
                <input 
                  type="text" 
                  required
                  placeholder="New Category Name..."
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="flex-1 px-3.5 py-2 border border-border rounded-sm text-sm outline-none focus:border-text-primary"
                />
                <button 
                  type="submit"
                  className="bg-text-primary text-bg-primary px-5 py-2 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors whitespace-nowrap"
                >
                  {editingCatId ? 'Save' : 'Add'}
                </button>
                {editingCatId && (
                  <button 
                    type="button"
                    onClick={() => { setEditingCatId(null); setCatName(''); }}
                    className="border border-border text-text-primary px-4 py-2 rounded-sm text-xs font-medium hover:border-text-primary transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                )}
              </form>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-text-muted mb-1">Existing Categories</h3>
                {categories.map(cat => (
                  <div key={cat.id} className="flex justify-between items-center px-4 py-3 border border-border rounded-sm">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {getCategoryDisplayName(cat.name, cat.id)}
                    </span>
                    <div className="flex gap-1.5">
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setCatName(cat.name);
                        }}
                        className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1.5 text-text-muted hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-text-secondary text-center py-4">No categories found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
